# open-source-toolkit

Framework-agnostic TypeScript developer utilities by **@ceptesoft**, extracted
from production ERP / field-operations code (accounts receivable, stock,
route planning, offline-first sync).

## Status

🚧 **Scaffolding phase.** No packages have been extracted yet.

- [PLAN.md](./PLAN.md) — extraction candidates and their source locations.
- [RULES.md](./RULES.md) — the architectural constitution every package must follow.

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
