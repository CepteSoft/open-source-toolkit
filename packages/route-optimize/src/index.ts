/**
 * Zero-API-cost route planning: builds an open tour (starts at the origin, no
 * return leg) over as-the-crow-flies (haversine) distances using
 * nearest-neighbor construction + 2-opt improvement. No mapping API is
 * called — stop ordering is solved here; actual driving is handed off to the
 * driver's navigation app (Google Maps, Apple Maps, Yandex Maps, Waze) via
 * keyless URL schemes.
 *
 * Extracted from production route-planning code. Everything is pure and
 * synchronous, so it runs in browsers, Node, and workers alike. Deliberately
 * *not* included: real road distances/ETAs (see
 * `@ceptesoft/distance-matrix-batch`) and location-link parsing (see
 * `@ceptesoft/geo-link-parser`) — compose them at the call site.
 */

export type LatLng = { lat: number; lng: number };
export type RouteStop = LatLng & { id: string };

const EARTH_RADIUS_M = 6_371_000;

/** A Google Maps directions URL accepts at most 9 waypoints + 1 destination (10 stops). */
export const MAX_MAPS_STOPS = 10;

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Parses a `"lat,lng"` string into a coordinate. Returns `null` when the
 * input is not two finite numbers or is outside valid ranges (so free-form
 * address text is filtered out rather than misparsed).
 */
export function parseLatLngString(value: string | null): LatLng | null {
  if (!value) return null;
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Solves an open tour (starts at `origin`, does not return): nearest-neighbor
 * construction followed by 2-opt improvement. Returns stop ids in visiting
 * order. 25 stops ≈ 625 distances — millisecond work, safe to run
 * synchronously on the client.
 */
export function solveTour(origin: LatLng, stops: readonly RouteStop[]): string[] {
  const n = stops.length;
  if (n <= 1) return stops.map((s) => s.id);

  const originDist = stops.map((s) => haversineMeters(origin, s));
  const dist = stops.map((a) => stops.map((b) => haversineMeters(a, b)));

  // Nearest-neighbor: start from the origin, always go to the closest unvisited stop.
  const remaining = new Set<number>(stops.map((_, i) => i));
  const tour: number[] = [];
  let current = -1; // -1 = origin
  while (remaining.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const i of remaining) {
      const d = current === -1 ? originDist[i]! : dist[current]![i]!;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    tour.push(best);
    remaining.delete(best);
    current = best;
  }

  // 2-opt for an open path: reversing tour[i..j] only changes the (i-1→i) and
  // (j→j+1) edges; apply when the total shrinks, repeat until no improvement.
  const edge = (from: number, to: number) => (from === -1 ? originDist[to]! : dist[from]![to]!);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      const prev = i === 0 ? -1 : tour[i - 1]!;
      for (let j = i + 1; j < n; j++) {
        const tailBefore = j + 1 < n ? dist[tour[j]!]![tour[j + 1]!]! : 0;
        const tailAfter = j + 1 < n ? dist[tour[i]!]![tour[j + 1]!]! : 0;
        if (edge(prev, tour[j]!) + tailAfter + 1e-9 < edge(prev, tour[i]!) + tailBefore) {
          for (let a = i, b = j; a < b; a++, b--) {
            [tour[a], tour[b]] = [tour[b]!, tour[a]!];
          }
          improved = true;
        }
      }
    }
  }

  return tour.map((i) => stops[i]!.id);
}

/** Total great-circle length of an ordered tour, in meters: origin → s0 → s1 → … */
export function approxTourMeters(origin: LatLng, orderedStops: readonly LatLng[]): number {
  let total = 0;
  let prev = origin;
  for (const stop of orderedStops) {
    total += haversineMeters(prev, stop);
    prev = stop;
  }
  return total;
}

export type FormatApproxKmOptions = {
  /**
   * BCP 47 locale for the decimal separator (e.g. `"tr-TR"` → `"~3,4 km"`).
   * Default: `"en-US"`.
   */
  locale?: string;
};

/**
 * Approximate distance label: `"~3.4 km"` (one decimal below 10 km),
 * `"~62 km"` (whole numbers from 10 km up).
 */
export function formatApproxKm(meters: number, options: FormatApproxKmOptions = {}): string {
  const { locale = "en-US" } = options;
  const km = meters / 1000;
  const text =
    km >= 10 ? String(Math.round(km)) : (Math.round(km * 10) / 10).toLocaleString(locale);
  return `~${text} km`;
}

export type MapsDirUrl = {
  url: string;
  /** Number of stops included in the URL (at most the target app's stop limit). */
  includedCount: number;
  totalCount: number;
};

/** Navigation apps a route can be handed off to via a keyless URL. */
export type NavTarget = "google" | "apple" | "yandex" | "waze";

/**
 * Max stops each app accepts in a single directions URL.
 * - `google`: 9 waypoints + 1 destination.
 * - `yandex`: conservative cap — Yandex does not publish an official limit.
 * - `apple`/`waze`: their URL schemes navigate to a single destination; for
 *   multi-stop runs use `buildNavLegUrls` (one URL per leg).
 */
export const NAV_STOP_LIMITS: Record<NavTarget, number> = {
  google: 10,
  yandex: 10,
  apple: 1,
  waze: 1,
};

const toParam = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Keyless directions URL for the given navigation app, visiting the stops in
 * the GIVEN order (no app re-optimizes — ordering is `solveTour`'s job). When
 * the app's stop limit is exceeded, the first `NAV_STOP_LIMITS[target]` stops
 * are used; the last of them becomes the destination, the rest waypoints.
 * Returns `null` for an empty stop list.
 *
 * Note: Waze URLs cannot express a starting point — navigation always starts
 * from the device's current location, so `origin` is ignored for `"waze"`.
 */
export function buildNavDirUrl(
  target: NavTarget,
  origin: LatLng,
  orderedStops: readonly LatLng[]
): MapsDirUrl | null {
  if (orderedStops.length === 0) return null;
  const included = orderedStops.slice(0, NAV_STOP_LIMITS[target]);
  const destination = included[included.length - 1]!;
  let url: string;

  switch (target) {
    case "google": {
      const params = new URLSearchParams({
        api: "1",
        origin: toParam(origin),
        destination: toParam(destination),
        travelmode: "driving",
      });
      const waypoints = included.slice(0, -1);
      if (waypoints.length > 0) params.set("waypoints", waypoints.map(toParam).join("|"));
      url = `https://www.google.com/maps/dir/?${params.toString()}`;
      break;
    }
    case "yandex": {
      const params = new URLSearchParams({
        mode: "routes",
        rtext: [origin, ...included].map(toParam).join("~"),
        rtt: "auto",
      });
      url = `https://yandex.com/maps/?${params.toString()}`;
      break;
    }
    case "apple": {
      const params = new URLSearchParams({
        saddr: toParam(origin),
        daddr: toParam(destination),
        dirflg: "d",
      });
      url = `https://maps.apple.com/?${params.toString()}`;
      break;
    }
    case "waze": {
      const params = new URLSearchParams({ ll: toParam(destination), navigate: "yes" });
      url = `https://waze.com/ul?${params.toString()}`;
      break;
    }
  }

  return { url, includedCount: included.length, totalCount: orderedStops.length };
}

/**
 * Keyless Google Maps directions URL — equivalent to
 * `buildNavDirUrl("google", origin, orderedStops)`, kept as a named export.
 */
export function buildGoogleMapsDirUrl(
  origin: LatLng,
  orderedStops: readonly LatLng[]
): MapsDirUrl | null {
  return buildNavDirUrl("google", origin, orderedStops);
}

/**
 * Stop-by-stop handoff: one navigation URL per leg (origin → s0, s0 → s1, …),
 * in tour order. This is the practical mode for apps without multi-stop URL
 * support (Apple Maps, Waze) and mirrors real field use — the driver opens
 * the next leg after finishing each visit. Works for every `NavTarget`.
 */
export function buildNavLegUrls(
  target: NavTarget,
  origin: LatLng,
  orderedStops: readonly LatLng[]
): string[] {
  const urls: string[] = [];
  let from = origin;
  for (const to of orderedStops) {
    urls.push(buildNavDirUrl(target, from, [to])!.url);
    from = to;
  }
  return urls;
}
