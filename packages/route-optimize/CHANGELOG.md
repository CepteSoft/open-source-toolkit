# @ceptesoft/route-optimize

## 0.2.0

### Minor Changes

- Multi-app navigation handoff: new `buildNavDirUrl(target, …)` supporting
  Google Maps, Apple Maps, Yandex Maps and Waze keyless URL schemes, new
  `buildNavLegUrls` for stop-by-stop (leg-per-URL) navigation, and
  `NAV_STOP_LIMITS` documenting each app's stop cap. `buildGoogleMapsDirUrl`
  is now a shorthand for `buildNavDirUrl("google", …)` — behavior unchanged.

## 0.1.0

- Initial extraction from CepteCari `lib/route-optimize.ts` (the planning
  page's "optimize my route" tool).
- `formatApproxKm` gains a `{ locale }` option (default `"en-US"`) instead of
  the hardcoded `tr-TR` decimal separator.
- `solveTour`, `approxTourMeters`, `buildGoogleMapsDirUrl` now accept
  `readonly` arrays; behavior unchanged.
