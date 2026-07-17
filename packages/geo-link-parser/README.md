# @ceptesoft/geo-link-parser

Turns messy real-world location shares into a routable destination string:
`"lat,lng"`, an address text, or `null`. Handles **Google Maps, Yandex Maps,
Apple Maps, OpenStreetMap** links and bare coordinate text. Zero
dependencies; short-link resolution uses an **injectable `fetch`** (defaults
to `globalThis.fetch`), so it runs in Node, browsers, workers, and tests
without network access.

Extracted from production route-planning code (CepteCari), where customers
paste whatever their phone gives them: WhatsApp shares, `maps.app.goo.gl`
short links, `?q=` links, or plain coordinates.

> **Why not write this yourself?** The formats hide traps. The best known:
> Yandex Maps `ll=`/`pt=` parameters are **lon,lat** — the reverse of every
> other provider. Parse them naively and every Yandex share lands ~kilometers
> away at a mirrored coordinate. This package carries those traps as tests.

**Scope boundary:** parsing/resolution only — no geocoding of address text
(pass the returned string to your geocoding or Distance Matrix API).

## Install

```bash
npm install @ceptesoft/geo-link-parser
```

## Quickstart

```ts
import { normalizeLocation, parseLocationLink } from "@ceptesoft/geo-link-parser";

// Sync parse of one link/text (no HTTP)
parseLocationLink("https://www.google.com/maps/place/X/@39.75,30.49,13z"); // "39.75,30.49"
parseLocationLink("https://www.google.com/maps?q=Eskisehir+Merkez");       // "Eskisehir Merkez"
parseLocationLink("konum: 39.75,30.49");                                    // "39.75,30.49"

// Full pipeline: stored coords win → short links resolved → parsed
const destination = await normalizeLocation({
  link: "https://maps.app.goo.gl/abc123",
  latitude: null,
  longitude: null,
});
// e.g. "39.75,30.49"
```

Inject a custom fetch (tests, proxies, non-standard runtimes):

```ts
const destination = await normalizeLocation(
  { link: "https://goo.gl/xyz" },
  { fetch: async (url, init) => myHttpClient.follow(url, init) }
);
```

## API

### `normalizeLocation(input, options?): Promise<string | null>`

`input`: `{ link, latitude?, longitude? }`. Precedence: valid stored
coordinates → link (short links resolved by following redirects, retrying
with a mobile User-Agent when the first result is unparseable) → parse.

`options`: `fetch` (`FetchLike`, default `globalThis.fetch`),
`shortLinkHosts` (default `goo.gl` domains), `userAgents` (tried in order).

### `parseLocationLink(urlString): string | null`

Synchronous single-string parse. Precedence: Yandex `whatshere[point]`/`pt`/
`ll` (lon,lat — swapped) → path `@lat,lng` → `data=!3d!4d` → path `lat,lng`
→ `ll=`/`coordinate=` (lat,lng) → `mlat`/`mlon` and `lat`/`lon|lng` pairs →
`#map=zoom/lat/lon` (OSM) → `q`/`query`/`address` (coords, else returned as
address text) → hash → whole decoded text.

Covered provider formats:

| Provider | Formats |
|---|---|
| Google Maps | `@lat,lng` path, `data=!3d!4d`, `ll=`, `q=`/`query=`, short links (via `normalizeLocation`) |
| Yandex Maps | `ll=`, `pt=`, `whatshere[point]=` — all **lon,lat**, swapped automatically |
| Apple Maps | `ll=`, `coordinate=` (/place links), `address=` text fallback |
| OpenStreetMap | `mlat`/`mlon` markers, `#map=zoom/lat/lon`, generic `lat`/`lon` pairs |

### `isValidLatLng(lat, lng): boolean`

WGS84 bounds + finiteness check.
