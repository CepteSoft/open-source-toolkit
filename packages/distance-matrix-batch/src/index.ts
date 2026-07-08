/**
 * Google Distance Matrix client for route planning: ETA/distance from one
 * origin to N destinations, with transparent batching around the API's
 * 25-destination-per-request cap and parallel batch dispatch.
 *
 * Extracted from production route-planning code. Deliberately *not* included:
 * rate limiting/quota control (keep it at the call site) and location-link
 * normalization (see `@ceptesoft/geo-link-parser` — compose the two).
 */

export type LatLng = { lat: number; lng: number };

export type DistanceMatrixDestination = {
  /** Your identifier for the stop (echoed back on results). */
  id: string;
  /** Destination as the API accepts it: `"lat,lng"` or an address string. */
  destination: string;
};

export type DistanceMatrixResult = {
  id: string;
  duration: { value: number; text: string };
  distance?: { value: number; text: string };
};

export type DistanceMatrixResponse =
  | { ok: true; results: DistanceMatrixResult[] }
  | { ok: false; error: string };

/** Minimal structural subset of `fetch` used by the client. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type DistanceMatrixMessages = {
  /** Prefixed to the underlying error when the HTTP request itself throws. */
  requestFailed: string;
  /** Used when the response body is not valid JSON. */
  parseFailed: string;
  /** Used when the API returns a non-OK status without an error message. */
  unknownError: string;
};

export const DEFAULT_MESSAGES: DistanceMatrixMessages = {
  requestFailed: "Request failed",
  parseFailed: "Could not parse the API response.",
  unknownError: "Unknown Distance Matrix error",
};

export type DistanceMatrixClientOptions = {
  /** Google Maps API key (required — pass explicitly, never read from env by this package). */
  apiKey: string;
  /** HTTP implementation. Default: `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Destinations per request (Google's cap is 25). Default: `25`. */
  maxBatchSize?: number;
  /** Hard cap across all batches; extra destinations are dropped. Default: `300`. */
  maxDestinations?: number;
  /** Travel mode. Default: `"driving"`. */
  mode?: "driving" | "walking" | "bicycling" | "transit";
  /** Response language (e.g. `"tr"`). Omitted when not set. */
  language?: string;
  /** API endpoint override (tests, proxies). */
  endpoint?: string;
  /** Override error messages (e.g. for localization). */
  messages?: Partial<DistanceMatrixMessages>;
};

export type DistanceMatrixClient = {
  /**
   * ETA/distance from `origin` to every destination. Destinations beyond
   * `maxDestinations` are ignored; unreachable destinations (element status
   * not OK) are silently omitted from `results`.
   */
  getDistanceMatrix(
    origin: LatLng | string,
    destinations: readonly DistanceMatrixDestination[]
  ): Promise<DistanceMatrixResponse>;
};

type ApiRow = {
  elements: {
    status: string;
    duration?: { value: number; text: string };
    distance?: { value: number; text: string };
  }[];
};

type ApiBody = { rows?: ApiRow[]; error_message?: string; status?: string };

const DEFAULT_ENDPOINT = "https://maps.googleapis.com/maps/api/distancematrix/json";

/** Builds a Distance Matrix client. Throws when `apiKey` is missing (programmer error). */
export function createDistanceMatrixClient(
  options: DistanceMatrixClientOptions
): DistanceMatrixClient {
  const {
    apiKey,
    fetch: fetchImpl = globalThis.fetch as unknown as FetchLike,
    maxBatchSize = 25,
    maxDestinations = 300,
    mode = "driving",
    language,
    endpoint = DEFAULT_ENDPOINT,
    messages,
  } = options;
  if (!apiKey?.trim()) {
    throw new Error("createDistanceMatrixClient: apiKey is required.");
  }
  const msg: DistanceMatrixMessages = { ...DEFAULT_MESSAGES, ...messages };

  async function fetchBatch(
    originStr: string,
    batch: readonly DistanceMatrixDestination[]
  ): Promise<DistanceMatrixResponse> {
    const url = new URL(endpoint);
    url.searchParams.set("origins", originStr);
    url.searchParams.set("destinations", batch.map((d) => d.destination).join("|"));
    url.searchParams.set("key", apiKey);
    url.searchParams.set("mode", mode);
    if (language) url.searchParams.set("language", language);

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchImpl(url.toString());
    } catch (e) {
      return {
        ok: false,
        error: `${msg.requestFailed}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    let data: ApiBody;
    try {
      data = (await res.json()) as ApiBody;
    } catch {
      return { ok: false, error: msg.parseFailed };
    }
    if (data.error_message) return { ok: false, error: data.error_message };
    if (data.status !== "OK") return { ok: false, error: data.status ?? msg.unknownError };

    const row = data.rows?.[0];
    if (!row?.elements || row.elements.length !== batch.length) {
      return { ok: true, results: [] };
    }

    const results: DistanceMatrixResult[] = [];
    for (let i = 0; i < batch.length; i++) {
      const el = row.elements[i];
      if (el?.status !== "OK" || !el.duration) continue;
      results.push({
        id: batch[i]!.id,
        duration: { value: el.duration.value, text: el.duration.text ?? "" },
        distance: el.distance
          ? { value: el.distance.value, text: el.distance.text ?? "" }
          : undefined,
      });
    }
    return { ok: true, results };
  }

  return {
    async getDistanceMatrix(origin, destinations) {
      const originStr =
        typeof origin === "string" ? origin : `${origin.lat},${origin.lng}`;

      const capped = destinations.slice(0, maxDestinations);
      if (capped.length === 0) return { ok: true, results: [] };

      const batches: DistanceMatrixDestination[][] = [];
      for (let i = 0; i < capped.length; i += maxBatchSize) {
        batches.push(capped.slice(i, i + maxBatchSize));
      }

      const batchResults = await Promise.all(
        batches.map((batch) => fetchBatch(originStr, batch))
      );

      const all: DistanceMatrixResult[] = [];
      for (const r of batchResults) {
        if (!r.ok) return r;
        all.push(...r.results);
      }
      return { ok: true, results: all };
    },
  };
}
