# @ceptesoft/route-optimize

API-less route optimization for field sales / delivery runs: solves the stop
order locally with **nearest-neighbor + 2-opt** over as-the-crow-flies
(haversine) distances, then hands actual driving off to the Google Maps app
through its **keyless directions URL scheme**. Everything is pure and
synchronous — no network, no API key, zero dependencies — so it runs in
browsers, Node, and workers, and stays trivially testable.

Extracted from production ERP route-planning code (CepteCari), where a
salesperson picks the day's customers and gets a "optimize my route" button
that must work offline and without a paid Directions API quota.

**Scope boundary:** distances are great-circle approximations, good for
*ordering* stops — not for road ETAs or turn-by-turn. For real road
distances/ETAs compose with `@ceptesoft/distance-matrix-batch`; for parsing
messy shared location links into coordinates, `@ceptesoft/geo-link-parser`.

## Install

```bash
npm install @ceptesoft/route-optimize
```

## Quickstart

```ts
import {
  parseLatLngString,
  solveTour,
  approxTourMeters,
  formatApproxKm,
  buildGoogleMapsDirUrl,
  type RouteStop,
} from "@ceptesoft/route-optimize";

const origin = parseLatLngString("41.0082,28.9784")!; // e.g. device GPS

const stops: RouteStop[] = [
  { id: "cust-1", lat: 41.02, lng: 29.01 },
  { id: "cust-2", lat: 40.99, lng: 28.95 },
  { id: "cust-3", lat: 41.05, lng: 29.03 },
];

// 1) Optimal-ish visiting order (ids)
const orderedIds = solveTour(origin, stops);

// 2) Total length + human label
const ordered = orderedIds.map((id) => stops.find((s) => s.id === id)!);
const label = formatApproxKm(approxTourMeters(origin, ordered)); // "~9.8 km"
const labelTr = formatApproxKm(approxTourMeters(origin, ordered), { locale: "tr-TR" }); // "~9,8 km"

// 3) Keyless Google Maps handoff (opens the Maps app / web)
const dir = buildGoogleMapsDirUrl(origin, ordered);
if (dir) window.open(dir.url, "_blank");
```

## API

### `solveTour(origin, stops): string[]`

Solves an **open** tour: starts at `origin`, visits every stop once, does not
return. Nearest-neighbor construction + 2-opt improvement (reversal applied
only when the path shrinks; bounded at 100 improvement sweeps). Returns stop
`id`s in visiting order; always a permutation of the input. 25 stops ≈ 625
distance evaluations — millisecond work, safe on the client.

### `haversineMeters(a, b): number`

Great-circle distance between two `LatLng` points, in meters.

### `parseLatLngString(value): LatLng | null`

Parses `"lat,lng"` text (whitespace-tolerant). Returns `null` for anything
that isn't two finite in-range numbers — so free-form address text is
filtered out instead of misparsed.

### `approxTourMeters(origin, orderedStops): number`

Total great-circle length of the ordered tour: origin → s0 → s1 → …

### `formatApproxKm(meters, options?): string`

`"~3.4 km"` below 10 km (one decimal), `"~62 km"` from 10 km up.
`options.locale` (BCP 47, default `"en-US"`) controls the decimal separator:
`formatApproxKm(3400, { locale: "tr-TR" })` → `"~3,4 km"`.

### `buildGoogleMapsDirUrl(origin, orderedStops): MapsDirUrl | null`

Builds a keyless `https://www.google.com/maps/dir/?api=1&…` URL that
navigates the stops **in the given order** (Maps does not re-optimize —
ordering is `solveTour`'s job). Google's scheme caps a route at
`MAX_MAPS_STOPS` (10) stops: beyond that the first 10 are included, the last
of them becomes the destination and the rest waypoints. Returns
`{ url, includedCount, totalCount }`, or `null` for an empty stop list.

## Migration notes (from CepteCari `lib/route-optimize.ts`)

- `formatApproxKm` no longer hardcodes `tr-TR`; the default locale is
  `"en-US"`. Pass `{ locale: "tr-TR" }` to keep the previous output.
- Everything else is API-compatible (`haversineMeters`, `parseLatLngString`,
  `solveTour`, `approxTourMeters`, `buildGoogleMapsDirUrl`, `MAX_MAPS_STOPS`).

## License

MIT
