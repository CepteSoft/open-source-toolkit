# PLAN.md — Extraction Candidates

Candidates identified by scanning the CepteCari codebase (`c:\Users\Efe\Desktop\ketcash`).
Ordered by value-to-effort ratio: top items are nearly dependency-free already;
bottom items need real decoupling work. Source paths are relative to the
CepteCari repo root. Extraction is **copy-and-generalize**, never move — the
origin app keeps its own copies until it opts into consuming the packages.

---

## Tier 1 — Near-zero coupling, extract first

### 1. `@ceptesoft/money-utils`
- **Source:** `lib/numbers.ts`, `lib/kdv.ts`, `lib/currency.ts` (+ colocated `*.test.ts`)
- **Problem solved:** Safe monetary input handling for ERP/financial apps:
  locale-aware decimal parsing (comma → dot), overflow cap, NaN/Infinity
  rejection (Postgres `numeric` accepts `'NaN'` and poisons every `SUM()`),
  canonical DB-writable string output, and VAT (KDV) gross/net/tax-amount math.
- **Decoupling needed:** Turkish error strings in `parseAmount` become
  caller-supplied messages (options object with defaults); hardcoded
  `SUPPORTED_CURRENCIES` list becomes an init parameter; rename Turkish API
  names (`kdvHaric` → `netFromGross` etc.) with a documented mapping.

### 2. `@ceptesoft/phone-tr`
- **Source:** `lib/phone.ts` (+ `lib/phone.test.ts`)
- **Problem solved:** Turkish mobile phone normalization/validation: digit
  extraction, `5XX…` → `05XX…`, `90…` country-code stripping, strict 11-digit
  validation with a type-guard predicate. Useful to any TR-market product.
- **Decoupling needed:** Almost none — pure functions. Error message in
  `parsePhone` becomes configurable; design the API so other country modules
  could be added later (`phone-tr` stays TR-scoped, keep it honest).

### 3. `@ceptesoft/async-result`
- **Source:** `lib/run-with-loading.ts` (+ test), plus the `{ ok, error }`
  discriminated-union convention used across all Server Actions.
- **Problem solved:** Wraps any async call with a loading flag that is
  guaranteed to clear (success / `{ ok:false }` / throw), converting thrown
  errors into the result union so UIs never get stuck on "Loading…".
  Ships the `Result<T>` type + helpers (`ok()`, `err()`, `unwrapOr()`).
- **Decoupling needed:** Fallback error message ("Beklenmeyen bir hata…")
  becomes an option; keep it framework-free — `setLoading` is already just a
  `(v: boolean) => void` callback, so React/Zustand stay out of the core.

## Tier 2 — Small, well-bounded decoupling

### 4. `@ceptesoft/geo-link-parser`
- **Source:** `utils/location-link-to-destination.ts` (+ test)
- **Problem solved:** Turns messy real-world location shares into a routable
  destination: WhatsApp share links, Google Maps short links
  (`goo.gl`, `maps.app.goo.gl` — resolved via redirect-following fetch with
  mobile-UA fallback), `?q=`, `/maps/search/`, `/place/…/@lat,lng`, and
  `!3d…!4d…` data params. Returns `"lat,lng"` | address text | null, with
  lat/lng range validation.
- **Decoupling needed:** Remove the Next.js-specific `next: { revalidate: 0 }`
  fetch option; accept an injectable `fetch` implementation (defaults to
  `globalThis.fetch`) so it runs in Node, Deno, workers, and tests without
  network.

### 5. `@ceptesoft/local-first-store`
- **Source:** `store/app-data-store.ts` (the generic middleware layer:
  `debouncedStorage`, `versionedStorage`, upsert/remove-by-id collection
  updaters, `lastSyncAt` bookkeeping) + `store/app-data-store.test.ts`
- **Problem solved:** Offline-first persistence plumbing for Zustand `persist`:
  debounced writes (avoid main-thread jank on rapid updates), version-stamped
  storage that discards stale-schema snapshots instead of crashing on rehydrate,
  and generic keyed-collection CRUD helpers.
- **Decoupling needed:** Strip all domain types (`CustomerWithTags`,
  `ProductRow`, Supabase types) — the package exports generic
  `StateStorage` decorators and a `createCollectionSlice<T extends { id: string }>()`
  factory. Zustand is a **peer dependency** of a `zustand` sub-entry; the
  storage decorators themselves are vanilla TS (per RULES.md, the core must
  not require the framework).

### 6. `@ceptesoft/tz-day`
- **Source:** `utils/date.ts` (+ test)
- **Problem solved:** "What is *today* in the business's timezone?" — the
  UTC-midnight off-by-one that breaks date-keyed planning/orders (CepteCari
  rule #8: `Europe/Istanbul`). Tiny but universally misdone; `en-CA`
  `toLocaleDateString` trick returns `YYYY-MM-DD` with zero dependencies.
- **Decoupling needed:** Timezone becomes a required init/argument instead of
  the hardcoded `APP_TIMEZONE`. Candidate to fold into `money-utils`' sibling
  `@ceptesoft/format-tr` later if it stays this small — decide at extraction.

## Tier 3 — High value, real decoupling work

### 7. `@ceptesoft/distance-matrix-batch`
- **Source:** `app/(operasyon)/planning/actions.ts` (≈ lines 410–540:
  `DistanceMatrixResultItem`, `fetchDistanceMatrixBatch`, `getDistanceMatrix`,
  the 25-destination batch splitter and parallel batch dispatch)
- **Problem solved:** Route-planning ETA/distance for N stops against the
  Google Distance Matrix API: transparent batching around the 25-destination
  per-request cap, parallel batch execution, result flattening, and typed
  `{ ok, error }` results. This is the reusable heart of the route-planning
  module.
- **Decoupling needed:** It currently lives inside a Server Action and mixes
  in per-user rate limiting and env-var API-key lookup. Extract as a pure
  client: `createDistanceMatrixClient({ apiKey, fetch?, maxBatchSize?, language? })`;
  rate limiting stays in the app (or becomes an optional injectable
  `throttle` hook). No `process.env` reads inside the package.

### 8. `@ceptesoft/rate-limit-groups`
- **Source:** `lib/rate-limit.ts`
- **Problem solved:** Declarative path-group rate limiting (e.g. `auth` =
  10 req/60s, `api` = 60 req/60s) with sliding windows, per-instance ephemeral
  cache, and — critically — **fail-open** behavior when the backing store is
  unconfigured or down, so rate limiting can never take production auth down.
- **Decoupling needed:** Heaviest lift of the list. Remove `process.env`
  reads (Upstash URL/token) and the `NextRequest` type: config is passed at
  init (`createRateLimiter({ store, groups })`), the store becomes a minimal
  injected interface (Upstash Redis adapter shipped as a sub-package or
  separate `@ceptesoft/rate-limit-groups-upstash`), and path matching accepts
  plain strings. Group definitions (paths, window, limit) are caller data,
  not constants.

## Evaluated and deferred

- **`utils/export-helpers.ts` (PDF/Excel export)** — useful, but drags jsPDF +
  SheetJS as heavy deps and is entangled with the `Transaction` domain type and
  Turkish type labels. Revisit after Tier 1–3 as `@ceptesoft/table-export` with
  a column-spec-driven API.
- **`lib/balance.ts`** — the SATIŞ/TAHSİLAT sign logic is core ERP knowledge,
  but it is welded to Supabase RPCs and CepteCari's transaction-type enum.
  A generic "ledger direction" package would be too abstract to be useful; skip.
- **`lib/permissions.ts`, plan/entitlement code** — business rules, not
  utilities (violates RULES.md rule 1). Stay in-app.
- **Dynamic query filtering** — no generic query-builder exists in the
  codebase; list filtering is done in-memory over the offline store per page.
  Nothing to extract yet; if a shared filter engine emerges, add it here.

---

## Suggested extraction order

1. `phone-tr` → smallest, proves the repo pipeline end-to-end (build, test, publish dry-run).
2. `money-utils`, `async-result`, `tz-day` → same shape, batchable.
3. `geo-link-parser` → introduces the injectable-fetch pattern.
4. `local-first-store` → introduces the peer-dependency / sub-entry pattern.
5. `distance-matrix-batch`, `rate-limit-groups` → the two real refactors, done last with the patterns established.
