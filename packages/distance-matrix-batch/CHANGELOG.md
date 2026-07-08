# @ceptesoft/distance-matrix-batch

## 0.1.0

- Initial extraction from CepteCari `app/(operasyon)/planning/actions.ts`
  (`fetchDistanceMatrixBatch`, `getDistanceMatrix`, batch splitting).
- Decoupled from the Server Action: API key via init options (no
  `process.env`), injectable `fetch`, per-user rate limiting and location-link
  normalization removed (compose at the call site).
- New: configurable `maxBatchSize`/`maxDestinations`/`mode`/`language`/
  `endpoint`; error messages overridable (English defaults); generic `id`
  replaces `planItemId`.
