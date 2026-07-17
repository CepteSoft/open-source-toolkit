# @ceptesoft/geo-link-parser

## 0.2.0

### Minor Changes

- Provider coverage: Yandex Maps (`ll=`/`pt=`/`whatshere[point]=` parsed in
  their lon,lat order and swapped correctly), Apple Maps (`coordinate=` on
  /place links, `address=` text fallback), OpenStreetMap (`mlat`/`mlon`
  markers, `#map=zoom/lat/lon` hash) and generic `lat`/`lon|lng` query pairs.
  Existing Google Maps parsing is unchanged.

## 0.1.0

- Initial extraction from CepteCari `utils/location-link-to-destination.ts`.
- Renames: `normalizeLocationToDestination` → `normalizeLocation`; the
  internal URL parser is now public as `parseLocationLink`; `isValidLatLng`
  exported.
- New: injectable `fetch` (`FetchLike`) replaces the Next.js-specific fetch
  options; `shortLinkHosts` and `userAgents` are configurable.
