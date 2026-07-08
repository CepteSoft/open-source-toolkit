/**
 * Declarative path-group rate limiting with a pluggable store.
 *
 * FAIL-OPEN CONTRACT (deliberate): when no store is configured or the store
 * errors, requests are allowed. Rate limiting is a defense-in-depth control —
 * failing closed would let a store outage take down every guarded path
 * (a self-inflicted DoS). If you need distributed robustness, make the store
 * highly available; don't fail closed.
 */

export type RateLimitDecision = {
  limited: boolean;
  /** Seconds until the client may retry (only when `limited`). */
  retryAfter?: number;
};

/**
 * Minimal store contract. Implementations decide the algorithm (sliding
 * window recommended). `reset` is an epoch-milliseconds timestamp for when
 * the window frees up.
 */
export type RateLimitStore = {
  limit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ success: boolean; reset: number }>;
};

export type RateLimitGroup = {
  /** Unique name; also namespaces store keys (`<name>:<key>`). */
  name: string;
  /** Whether a pathname belongs to this group (see {@link prefixMatcher}). */
  match: (pathname: string) => boolean;
  /** Max requests per window. */
  limit: number;
  windowSeconds: number;
  /**
   * Path portion mixed into the bucket key so different endpoints in one
   * group get separate buckets. Default: first two path segments
   * (`/login/forgot-password/x` → `/login/forgot-password`).
   */
  keySegment?: (pathname: string) => string;
};

export type RateLimiterOptions = {
  /**
   * Backing store. Pass `null` to disable limiting entirely (e.g. missing
   * credentials) — every check returns `{ limited: false }`.
   */
  store: RateLimitStore | null;
  groups: readonly RateLimitGroup[];
  /** Clock override for tests. */
  now?: () => number;
};

export type RateLimiter = {
  /**
   * Limits `clientKey` (an IP, user id, …) on whichever group matches
   * `pathname`. Unmatched paths and store failures are never limited.
   */
  checkPath(pathname: string, clientKey: string): Promise<RateLimitDecision>;
  /** Limits `key` directly against a named group (Server Action use case). */
  check(groupName: string, key: string): Promise<RateLimitDecision>;
};

/** Builds a `match` function from path prefixes. */
export function prefixMatcher(prefixes: readonly string[]): (pathname: string) => boolean {
  return (pathname) => prefixes.some((p) => pathname.startsWith(p));
}

function defaultKeySegment(pathname: string): string {
  return pathname.split("/").slice(0, 3).join("/");
}

/** Builds a rate limiter. Throws on duplicate group names or non-positive limits (programmer error). */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { store, groups, now = Date.now } = options;

  const byName = new Map<string, RateLimitGroup>();
  for (const group of groups) {
    if (byName.has(group.name)) {
      throw new Error(`createRateLimiter: duplicate group name "${group.name}".`);
    }
    if (group.limit <= 0 || group.windowSeconds <= 0) {
      throw new Error(
        `createRateLimiter: group "${group.name}" needs positive limit and windowSeconds.`
      );
    }
    byName.set(group.name, group);
  }

  async function run(group: RateLimitGroup, key: string): Promise<RateLimitDecision> {
    if (!store) return { limited: false };
    try {
      const result = await store.limit(
        `${group.name}:${key}`,
        group.limit,
        group.windowSeconds * 1000
      );
      if (!result.success) {
        const retryAfter = Math.max(Math.ceil((result.reset - now()) / 1000), 1);
        return { limited: true, retryAfter };
      }
      return { limited: false };
    } catch {
      return { limited: false }; // store down → fail-open
    }
  }

  return {
    async checkPath(pathname, clientKey) {
      const group = groups.find((g) => g.match(pathname));
      if (!group) return { limited: false };
      const segment = (group.keySegment ?? defaultKeySegment)(pathname);
      return run(group, `${clientKey}:${segment}`);
    },
    async check(groupName, key) {
      const group = byName.get(groupName);
      if (!group) {
        throw new Error(`createRateLimiter: unknown group "${groupName}".`);
      }
      return run(group, key);
    },
  };
}

// ─── In-memory store ─────────────────────────────────────────────────────────

export type MemoryStoreOptions = {
  /** Clock override for tests. */
  now?: () => number;
};

/**
 * Sliding-window-log store held in process memory. Accurate and dependency-
 * free, but **instance-local**: in serverless/multi-instance deployments each
 * instance counts separately, so use it for tests, single-node servers, or as
 * a reference implementation — and a Redis-backed store for distributed
 * limiting.
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): RateLimitStore {
  const { now = Date.now } = options;
  const hits = new Map<string, number[]>();

  return {
    async limit(key, limit, windowMs) {
      const t = now();
      const windowStart = t - windowMs;
      const timestamps = (hits.get(key) ?? []).filter((ts) => ts > windowStart);

      if (timestamps.length >= limit) {
        hits.set(key, timestamps);
        return { success: false, reset: timestamps[0]! + windowMs };
      }
      timestamps.push(t);
      hits.set(key, timestamps);
      return { success: true, reset: timestamps[0]! + windowMs };
    },
  };
}
