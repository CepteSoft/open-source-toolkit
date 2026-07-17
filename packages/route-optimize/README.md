# @ceptesoft/route-optimize

**Zero-API-cost route planning** for field sales / delivery runs: solves the
stop order locally with **nearest-neighbor + 2-opt** over as-the-crow-flies
(haversine) distances, then hands actual driving off to the driver's own
navigation app — **Google Maps, Apple Maps, Yandex Maps, or Waze** — through
their keyless URL schemes. No Directions API, no key, no quota, no billing
surprise. Everything is pure and synchronous — zero dependencies — so it runs
in browsers, Node, and workers, and stays trivially testable.

Extracted from production ERP route-planning code (CepteCari), where a
salesperson picks the day's customers and gets an "optimize my route" button
that must work offline and without a paid Directions API quota.

**Scope boundary:** distances are great-circle approximations, good for
*ordering* stops — not for road ETAs or turn-by-turn. For real road
distances/ETAs compose with `@ceptesoft/distance-matrix-batch`; for parsing
messy shared location links into coordinates, `@ceptesoft/geo-link-parser`.
The parse → optimize → navigate chain covers the whole field-routing flow
without a single API call.

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

### `buildNavDirUrl(target, origin, orderedStops): MapsDirUrl | null`

Keyless directions URL for a navigation app, visiting the stops **in the
given order** (no app re-optimizes — ordering is `solveTour`'s job).
`target` is a `NavTarget`: `"google" | "apple" | "yandex" | "waze"`. Returns
`{ url, includedCount, totalCount }`, or `null` for an empty stop list.

Each app has a stop limit (`NAV_STOP_LIMITS`); stops beyond it are cut and
`includedCount < totalCount` tells you so:

| target | limit | notes |
|---|---|---|
| `google` | 10 | 9 waypoints + destination (`maps/dir/?api=1`) |
| `yandex` | 10 | `rtext` chained points; conservative cap — Yandex publishes no official limit |
| `apple` | 1 | `maps.apple.com` has no official multi-stop URL; use `buildNavLegUrls` |
| `waze` | 1 | Waze deep links navigate to one place and always start from the device's current location (`origin` is ignored) |

### `buildNavLegUrls(target, origin, orderedStops): string[]`

Stop-by-stop handoff: one URL per leg (`origin → s0`, `s0 → s1`, …) in tour
order — the driver opens the next link after each visit. This is the
practical mode for Apple Maps and Waze, and works for every target.

```ts
const legs = buildNavLegUrls("waze", origin, ordered);
// legs[0] → first customer, legs[1] → second, …
```

### `buildGoogleMapsDirUrl(origin, orderedStops): MapsDirUrl | null`

Shorthand for `buildNavDirUrl("google", origin, orderedStops)`, kept as a
named export.

## Migration notes (from CepteCari `lib/route-optimize.ts`)

- `formatApproxKm` no longer hardcodes `tr-TR`; the default locale is
  `"en-US"`. Pass `{ locale: "tr-TR" }` to keep the previous output.
- Everything else is API-compatible (`haversineMeters`, `parseLatLngString`,
  `solveTour`, `approxTourMeters`, `buildGoogleMapsDirUrl`, `MAX_MAPS_STOPS`).

## License

MIT
