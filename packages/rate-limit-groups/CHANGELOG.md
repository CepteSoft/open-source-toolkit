# @ceptesoft/rate-limit-groups

## 0.1.0

- Initial extraction from CepteCari `lib/rate-limit.ts` (`checkRateLimit`,
  `checkUserRateLimit`, path grouping, fail-open decision).
- Decoupled: no `process.env` reads, no `NextRequest` (plain `pathname` +
  client key), Upstash replaced by a minimal injected `RateLimitStore`
  interface (Upstash adapter documented in the README).
- New: declarative group config with `prefixMatcher` and per-group
  `keySegment`; `createMemoryStore` sliding-window reference implementation;
  injectable clock for tests.
