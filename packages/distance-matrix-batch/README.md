# @ceptesoft/distance-matrix-batch

Google Distance Matrix client for route planning: ETA/distance from one
origin to N stops, with **transparent batching** around the API's
25-destinations-per-request cap, parallel batch dispatch, and typed
`{ ok, error }` results. Injectable `fetch`, zero dependencies.

Extracted from production route-planning code (CepteCari), where a day's
route can hold hundreds of customer stops.

**Scope boundaries — deliberately not included:**
- Rate limiting / quota control — keep it at the call site, where you know
  your users.
- Location-link parsing — compose with
  [`@ceptesoft/geo-link-parser`](../geo-link-parser) to turn shared links
  into `destination` strings first.

## Install

```bash
npm install @ceptesoft/distance-matrix-batch
```

## Quickstart

```ts
import { createDistanceMatrixClient } from "@ceptesoft/distance-matrix-batch";

const client = createDistanceMatrixClient({
  apiKey: myConfig.googleMapsApiKey, // passed explicitly — never read from env
  language: "tr",
});

const res = await client.getDistanceMatrix(
  { lat: 39.75, lng: 30.49 }, // or "39.75,30.49"
  [
    { id: "stop-1", destination: "39.76,30.52" },
    { id: "stop-2", destination: "Eskişehir Çarşı" }, // addresses work too
    // …up to maxDestinations (default 300), batched 25 per request
  ]
);

if (!res.ok) {
  console.error(res.error);
} else {
  for (const r of res.results) {
    console.log(r.id, r.duration.text, r.distance?.text);
  }
}
```

Composing with `@ceptesoft/geo-link-parser`:

```ts
import { normalizeLocation } from "@ceptesoft/geo-link-parser";

const stops = await Promise.all(
  customers.map(async (c) => ({
    id: c.id,
    destination: await normalizeLocation({
      link: c.mapsLink,
      latitude: c.latitude,
      longitude: c.longitude,
    }),
  }))
);
const valid = stops.filter((s): s is { id: string; destination: string } => s.destination != null);
const res = await client.getDistanceMatrix(origin, valid);
```

## API

### `createDistanceMatrixClient(options)` → `{ getDistanceMatrix }`

Options: `apiKey` (required; throws when missing), `fetch` (default
`globalThis.fetch`), `maxBatchSize` (25), `maxDestinations` (300, extra stops
dropped), `mode` (`"driving"`), `language`, `endpoint` (proxy/test override),
`messages` (localize `requestFailed`/`parseFailed`/`unknownError`; defaults in
`DEFAULT_MESSAGES`).

### `getDistanceMatrix(origin, destinations)` → `Promise<DistanceMatrixResponse>`

`origin`: `{ lat, lng }` or a string. `destinations`: `{ id, destination }[]`
— `id` is echoed back on results. Unreachable stops (element status not OK)
are omitted from `results`; any failed batch fails the whole call with its
error.
