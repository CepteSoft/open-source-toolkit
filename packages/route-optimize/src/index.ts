/**
 * API-less route optimization: builds an open tour (starts at the origin, no
 * return leg) over as-the-crow-flies (haversine) distances using
 * nearest-neighbor construction + 2-opt improvement. No mapping API is
 * called — stop ordering is solved here; actual driving is handed off to the
 * Google Maps app via its keyless URL scheme.
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
  /** Number of stops included in the URL (at most `MAX_MAPS_STOPS`). */
  includedCount: number;
  totalCount: number;
};

/**
 * Keyless Google Maps directions URL that navigates the stops in the GIVEN
 * order (Maps does not re-optimize — ordering is `solveTour`'s job). When the
 * stop limit is exceeded, the first `MAX_MAPS_STOPS` stops are used; the last
 * one becomes the destination, the rest become waypoints. Returns `null` for
 * an empty stop list.
 */
export function buildGoogleMapsDirUrl(
  origin: LatLng,
  orderedStops: readonly LatLng[]
): MapsDirUrl | null {
  if (orderedStops.length === 0) return null;
  const included = orderedStops.slice(0, MAX_MAPS_STOPS);
  const toParam = (p: LatLng) => `${p.lat},${p.lng}`;
  const destination = included[included.length - 1]!;
  const waypoints = included.slice(0, -1);

  const params = new URLSearchParams({
    api: "1",
    origin: toParam(origin),
    destination: toParam(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) params.set("waypoints", waypoints.map(toParam).join("|"));

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    includedCount: included.length,
    totalCount: orderedStops.length,
  };
}
