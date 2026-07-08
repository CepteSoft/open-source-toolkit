# RULES.md — Architectural Constitution

These rules are **hierarchical**: a lower-numbered rule always wins over a
higher-numbered one, and any package that cannot satisfy Rule 1–3 does not
belong in this repository. PRs are reviewed against this document; deviations
require an explicit exception note in the package's README.

---

## Rule 1 — Zero framework & zero business coupling (non-negotiable)

1.1. Every package **core** (`src/`) is vanilla TypeScript: no imports from
     React, Next.js, Zustand, Supabase, Capacitor, or any other framework/BaaS.
     If it can't run in a bare Node 20 script *and* a browser, it doesn't ship.

1.2. Framework adapters are allowed only as **separate sub-packages**
     (`@ceptesoft/foo-react`) or as secondary entry points
     (`@ceptesoft/foo/zustand`) whose framework is declared as a
     `peerDependency`. The root entry point must never pull the framework in.

1.3. No business domain leaks: no CepteCari types, transaction-type enums,
     Turkish UI strings as defaults-you-can't-change, org/tenant concepts, or
     references to a specific database schema. If a function needs domain
     knowledge, it receives it as a parameter.

1.4. Human-facing strings (error messages, labels) must be overridable via
     options. Defaults may exist (and may be English or Turkish where the
     package is locale-scoped, e.g. `phone-tr`), but the caller always gets
     the last word.

## Rule 2 — Parameter-driven configuration (no ambient state)

2.1. **No `process.env` reads inside a package. Ever.** API keys, URLs,
     tokens, feature flags — all arrive through an explicit init call:
     `createClient({ apiKey })`, not `process.env.GOOGLE_API_KEY`.

2.2. No hidden I/O singletons. Anything that touches the network, storage, or
     clocks accepts an injectable implementation with a sane default
     (`fetch = globalThis.fetch`, `now = () => new Date()`), so tests and
     non-Node runtimes work without patching globals.

2.3. No assumptions about a host database or schema. Packages that persist or
     query define a **minimal interface** (e.g. `{ get, set, remove }`) and
     ship concrete adapters separately.

2.4. Configuration is validated at init time with typed options objects and
     documented defaults. Failing fast with a clear error beats silently
     misbehaving — except where the package's documented contract is
     fail-open (e.g. rate limiting).

## Rule 3 — Package anatomy (identical for every package)

Every folder under `packages/` must contain exactly this skeleton (plus
whatever `src/` needs):

```
packages/<name>/
├── package.json      # name @ceptesoft/<name>, "type": "module", exports map
├── README.md         # what/why, install, quickstart, full API, migration notes
├── LICENSE           # MIT, per-package copy (required for standalone consumption)
├── CHANGELOG.md      # kept by the release tool (Changesets)
├── tsconfig.json     # extends ../../tsconfig.base.json
└── src/
    ├── index.ts      # the ONLY public entry point (plus declared sub-entries)
    └── *.test.ts     # tests colocated with source, run by the workspace pipeline
```

3.1. **Independent versioning.** Every package has its own semver, released
     via Changesets; no lockstep version bumps. Breaking API changes = major.

3.2. `src/index.ts` is the sole public surface. Deep imports
     (`@ceptesoft/foo/src/internal`) are not supported and the `exports` map
     in `package.json` must make them impossible.

3.3. Cross-package dependencies inside the toolkit are allowed but must be
     declared as normal versioned `dependencies` (`workspace:` ranges during
     dev), never relative `../../other-package` imports.

## Rule 4 — Quality bar

4.1. `strict` TypeScript (inherited from `tsconfig.base.json`); `any` is
     forbidden in public APIs and in source (use `unknown` + narrowing).

4.2. Every exported function has tests covering the happy path, the documented
     failure modes, and boundary values. A package with a failing or empty
     test suite cannot be published.

4.3. Errors follow the toolkit-wide result convention: expected failures
     return a `{ ok: true, … } | { ok: false, error }` discriminated union;
     `throw` is reserved for programmer errors (invalid init config, contract
     violations).

4.4. No `console.*` in published code. Packages that need observability
     accept an optional `onEvent`/`logger` callback.

4.5. Zero runtime dependencies is the default; each added dependency must be
     justified in the package README. Heavy deps (PDF, XLSX, SDK clients)
     confine themselves to adapter sub-packages.

## Rule 5 — Documentation & provenance

5.1. Each README states the package's origin ("extracted from production ERP
     route-planning code") and its scope boundaries — what it deliberately
     does *not* do.

5.2. Public API changes land with README + CHANGELOG updates in the same PR.

5.3. Examples in READMEs must be runnable as written — no pseudo-code with
     invented parameters.
