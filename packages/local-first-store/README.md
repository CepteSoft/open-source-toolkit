# @ceptesoft/local-first-store

Offline-first persistence plumbing for stores that keep server data locally
for instant reads: **debounced** and **version-stamped** storage decorators,
plus immutable keyed-collection helpers. Zero dependencies — the decorators
are structurally compatible with `window.localStorage` and the sync subset of
zustand's `StateStorage`, but zustand is not required.

Extracted from a production PWA (CepteCari) where customers/suppliers/
products live in a persisted store: writing a large JSON snapshot to
localStorage on every keystroke janks the UI, and rehydrating a snapshot
written by an older app version crashes on schema drift.

**Scope boundary:** persistence plumbing only — no sync engine, no conflict
resolution.

## Install

```bash
npm install @ceptesoft/local-first-store
```

## Quickstart (with zustand persist)

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { debounceStorage, versionStorage, upsertById, removeById } from "@ceptesoft/local-first-store";

const PERSIST_VERSION = 4;

type Customer = { id: string; name: string };
type State = {
  version: number;
  customers: Customer[];
  upsertCustomer: (c: Customer) => void;
  removeCustomer: (id: string) => void;
};

const useStore = create<State>()(
  persist(
    (set) => ({
      version: PERSIST_VERSION,
      customers: [],
      upsertCustomer: (c) => set((s) => ({ customers: upsertById(s.customers, c) })),
      removeCustomer: (id) => set((s) => ({ customers: removeById(s.customers, id) })),
    }),
    {
      name: "app-data",
      storage: createJSONStorage(() =>
        versionStorage(debounceStorage(window.localStorage, 400), PERSIST_VERSION)
      ),
    }
  )
);
```

Flush pending writes when the tab closes:

```ts
const storage = debounceStorage(window.localStorage, 400);
window.addEventListener("pagehide", () => storage.flush());
```

## API

### `debounceStorage(base, debounceMs)` → `DebouncedStorage`

Coalesces rapid `setItem` calls into one write after `debounceMs` of quiet.
While a write is pending, `getItem` returns the pending value
(read-your-writes) and `removeItem` cancels it. `flush()` writes immediately.

### `versionStorage(base, version, options?)` → `SyncStringStorage`

`getItem` returns `null` (instead of the raw snapshot) when the persisted
JSON fails to parse or its version stamp doesn't equal `version` — the store
falls back to initial state instead of crashing on stale schemas. The stamp
is read from `parsed.state.version` by default; override with
`options.getVersion`.

### `upsertById(list, item)` / `removeById(list, id)`

Immutable helpers for `{ id: string }` collections. `upsertById` inserts new
ids at the front (newest-first) and replaces existing ids **in place** so
visible ordering doesn't jump.
