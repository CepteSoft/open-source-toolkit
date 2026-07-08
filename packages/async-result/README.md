# @ceptesoft/async-result

`{ ok, error }` result types and `runWithLoading` — a loading-flag wrapper
that is **guaranteed to clear** in every outcome (success, returned failure,
thrown error, synchronous throw). Zero dependencies, framework-free.

Extracted from production ERP code (CepteCari), where every server mutation
returns a discriminated union and modals must never get stuck on "Loading…"
when the network dies mid-request.

**Scope boundary:** not a general functional Result/Either library (no `map`/
`flatMap` chains) — it standardizes one pragmatic convention.

## Install

```bash
npm install @ceptesoft/async-result
```

## Quickstart

```ts
import { runWithLoading, err, type Result } from "@ceptesoft/async-result";

// A server mutation using the convention
async function renameItem(id: string, name: string): Promise<Result<{ id: string }>> {
  if (!name.trim()) return err("Name is required.");
  return { ok: true, id };
}

// UI side — setLoading is any (v: boolean) => void, e.g. React state
const result = await runWithLoading(setLoading, () => renameItem("1", "New name"));
if (!result.ok) {
  setError(result.error); // typed string; loading flag already cleared
  return;
}
console.log(result.id);
```

Throws become the failure arm instead of escaping:

```ts
const r = await runWithLoading(
  setLoading,
  () => fetchThatMightThrow(),
  {
    unexpectedErrorMessage: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    onUnexpectedError: (e) => console.error(e), // telemetry hook
  }
);
// r is the fn result, or { ok: false, error: <unexpectedErrorMessage> }
```

## API

- **`Result<T extends object = {}, E = string>`** — `({ ok: true } & T) | { ok: false; error: E }`.
- **`Failure<E = string>`** — the failure arm alone.
- **`err(error)`** — builds a failure.
- **`runWithLoading(setLoading, fn, options?)`** — runs `fn` with
  `setLoading(true)` … `setLoading(false)` in a `finally`; converts throws to
  `{ ok: false, error: options.unexpectedErrorMessage ?? DEFAULT_UNEXPECTED_ERROR }`
  and reports them to `options.onUnexpectedError`.
