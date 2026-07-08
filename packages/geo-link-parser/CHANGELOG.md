# @ceptesoft/geo-link-parser

## 0.1.0

- Initial extraction from CepteCari `utils/location-link-to-destination.ts`.
- Renames: `normalizeLocationToDestination` → `normalizeLocation`; the
  internal URL parser is now public as `parseLocationLink`; `isValidLatLng`
  exported.
- New: injectable `fetch` (`FetchLike`) replaces the Next.js-specific fetch
  options; `shortLinkHosts` and `userAgents` are configurable.
