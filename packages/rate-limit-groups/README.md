# @ceptesoft/rate-limit-groups

Declarative path-group rate limiting with a pluggable store and a documented
**fail-open contract**. Zero dependencies.

Extracted from production middleware (CepteCari), where auth endpoints get
10 req/60s and general API paths 60 req/60s — and where the deliberate
security decision was: *if the rate-limit store is down, let traffic
through*. Failing closed would turn a store outage into a self-inflicted
denial of service on every guarded path. Rate limiting is defense-in-depth;
availability wins.

**Scope boundary:** no HTTP framework types — you pass a `pathname` and a
client key (IP, user id). Adapters for Next.js/Express are one-liners at the
call site.

## Install

```bash
npm install @ceptesoft/rate-limit-groups
```

## Quickstart

```ts
import {
  createRateLimiter,
  createMemoryStore,
  prefixMatcher,
} from "@ceptesoft/rate-limit-groups";

const limiter = createRateLimiter({
  store: createMemoryStore(), // or your Redis-backed store (below), or null to disable
  groups: [
    { name: "auth", match: prefixMatcher(["/login", "/signup"]), limit: 10, windowSeconds: 60 },
    { name: "api", match: prefixMatcher(["/api/"]), limit: 60, windowSeconds: 60 },
  ],
});

// Middleware (IP-based)
const { limited, retryAfter } = await limiter.checkPath(pathname, clientIp);
if (limited) return new Response("Too Many Requests", {
  status: 429,
  headers: { "Retry-After": String(retryAfter) },
});

// Server Action (user-based, direct group)
const decision = await limiter.check("auth", userId);
```

## The store interface

```ts
type RateLimitStore = {
  limit(key: string, limit: number, windowMs: number): Promise<{ success: boolean; reset: number }>;
};
```

`createMemoryStore()` ships in the box: an accurate sliding-window log, but
**instance-local** — right for tests and single-node servers, wrong for
serverless fleets. For distributed limiting back it with Redis; an Upstash
adapter is this small (with `@upstash/ratelimit` and `@upstash/redis`
installed in *your* app):

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimitStore } from "@ceptesoft/rate-limit-groups";

function upstashStore(redis: Redis): RateLimitStore {
  const limiters = new Map<string, Ratelimit>();
  return {
    async limit(key, limit, windowMs) {
      const id = `${limit}:${windowMs}`;
      let rl = limiters.get(id);
      if (!rl) {
        rl = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(limit, `${windowMs / 1000} s`),
          prefix: "rl",
          ephemeralCache: new Map(),
        });
        limiters.set(id, rl);
      }
      const r = await rl.limit(key);
      return { success: r.success, reset: r.reset };
    },
  };
}

// Config arrives as parameters — this package never reads process.env
const store = url && token ? upstashStore(new Redis({ url, token })) : null;
```

## Fail-open semantics (by design)

`{ limited: false }` is returned when: the path matches no group, `store` is
`null`, or the store rejects/throws. Programmer errors still throw: duplicate
group names, non-positive limits, `check()` with an unknown group name.

## API

- **`createRateLimiter({ store, groups, now? })`** → `{ checkPath, check }`.
  Group: `{ name, match, limit, windowSeconds, keySegment? }`. Buckets are
  keyed `<group>:<clientKey>:<segment>`, where `segment` defaults to the
  first two path segments (per-endpoint buckets inside a group).
- **`prefixMatcher(prefixes)`** → `match` function.
- **`createMemoryStore({ now? })`** → in-memory sliding-window `RateLimitStore`.
