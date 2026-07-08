# @ceptesoft/local-first-store

## 0.1.0

- Initial extraction from CepteCari `store/app-data-store.ts`
  (`debouncedStorage`, `versionedStorage`, and the per-collection
  upsert/remove updaters, generalized to `upsertById`/`removeById`).
- New vs. origin: `debounceStorage` gains read-your-writes `getItem`,
  pending-write cancellation on `removeItem`, and a `flush()` method;
  `versionStorage` takes the version as a parameter with a customizable
  `getVersion` selector; domain types removed (zustand no longer referenced).
