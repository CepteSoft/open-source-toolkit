# open-source-toolkit

Framework-agnostic TypeScript developer utilities by **@ceptesoft**, extracted
from production ERP / field-operations code (accounts receivable, stock,
route planning, offline-first sync).

## Status

✅ **All eight planned packages extracted** (v0.1.0, not yet published),
plus `route-optimize` added after the initial plan.

| Package | What it does |
|---|---|
| [`@ceptesoft/phone-tr`](./packages/phone-tr) | Turkish phone normalization/validation |
| [`@ceptesoft/money-utils`](./packages/money-utils) | Safe amount parsing, VAT math, currency registry |
| [`@ceptesoft/async-result`](./packages/async-result) | `{ ok, error }` results + leak-proof loading wrapper |
| [`@ceptesoft/tz-day`](./packages/tz-day) | Timezone-correct calendar day (`YYYY-MM-DD`) |
| [`@ceptesoft/geo-link-parser`](./packages/geo-link-parser) | Maps/WhatsApp share links → `"lat,lng"` or address |
| [`@ceptesoft/local-first-store`](./packages/local-first-store) | Debounced + versioned storage decorators, collection helpers |
| [`@ceptesoft/distance-matrix-batch`](./packages/distance-matrix-batch) | Batched Google Distance Matrix client |
| [`@ceptesoft/rate-limit-groups`](./packages/rate-limit-groups) | Declarative fail-open path-group rate limiting |
| [`@ceptesoft/route-optimize`](./packages/route-optimize) | Zero-API-cost stop ordering (NN + 2-opt) + keyless handoff to Google/Apple/Yandex/Waze |

## Layout

```
open-source-toolkit/
├── package.json        # npm workspaces root (packages/*)
├── turbo.json          # Turborepo task pipeline (build → test/typecheck)
├── tsconfig.base.json  # strict TS defaults, extended by every package
└── packages/           # one folder per published @ceptesoft/* package
```

## Development

```bash
npm install       # install workspace deps
npm run build     # turbo run build (topological)
npm run test      # turbo run test
```
