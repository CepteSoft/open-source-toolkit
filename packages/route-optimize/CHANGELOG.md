# @ceptesoft/route-optimize

## 0.1.0

- Initial extraction from CepteCari `lib/route-optimize.ts` (the planning
  page's "optimize my route" tool).
- `formatApproxKm` gains a `{ locale }` option (default `"en-US"`) instead of
  the hardcoded `tr-TR` decimal separator.
- `solveTour`, `approxTourMeters`, `buildGoogleMapsDirUrl` now accept
  `readonly` arrays; behavior unchanged.
