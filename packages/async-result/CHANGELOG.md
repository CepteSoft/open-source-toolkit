# @ceptesoft/async-result

## 0.1.0

- Initial extraction from CepteCari `lib/run-with-loading.ts` and the
  app-wide `{ ok, error }` Server Action convention.
- New: `Result`/`Failure` types and `err` helper; fallback message is
  configurable (`unexpectedErrorMessage`, English default) with an
  `onUnexpectedError` telemetry hook.
