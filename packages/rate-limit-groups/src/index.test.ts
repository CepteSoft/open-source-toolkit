import { describe, it, expect, vi } from "vitest";
import {
  createRateLimiter,
  createMemoryStore,
  prefixMatcher,
  type RateLimitStore,
  type RateLimitGroup,
} from "./index.js";

const authGroup: RateLimitGroup = {
  name: "auth",
  match: prefixMatcher(["/login", "/signup"]),
  limit: 2,
  windowSeconds: 60,
};

const apiGroup: RateLimitGroup = {
  name: "api",
  match: prefixMatcher(["/api/"]),
  limit: 5,
  windowSeconds: 60,
};

describe("createRateLimiter — init validation", () => {
  it("throws on duplicate group names", () => {
    expect(() =>
      createRateLimiter({ store: null, groups: [authGroup, { ...apiGroup, name: "auth" }] })
    ).toThrow(/duplicate/);
  });

  it("throws on non-positive limit or window", () => {
    expect(() =>
      createRateLimiter({ store: null, groups: [{ ...authGroup, limit: 0 }] })
    ).toThrow();
    expect(() =>
      createRateLimiter({ store: null, groups: [{ ...authGroup, windowSeconds: -1 }] })
    ).toThrow();
  });

  it("check() throws for an unknown group name (programmer error)", async () => {
    const limiter = createRateLimiter({ store: createMemoryStore(), groups: [authGroup] });
    await expect(limiter.check("nope", "u1")).rejects.toThrow(/unknown group/);
  });
});

describe("createRateLimiter — fail-open contract", () => {
  it("never limits when store is null (unconfigured)", async () => {
    const limiter = createRateLimiter({ store: null, groups: [authGroup] });
    for (let i = 0; i < 10; i++) {
      expect(await limiter.checkPath("/login", "1.2.3.4")).toEqual({ limited: false });
    }
  });

  it("never limits when the store throws (store down)", async () => {
    const broken: RateLimitStore = {
      limit: async () => {
        throw new Error("redis down");
      },
    };
    const limiter = createRateLimiter({ store: broken, groups: [authGroup] });
    expect(await limiter.checkPath("/login", "1.2.3.4")).toEqual({ limited: false });
    expect(await limiter.check("auth", "user-1")).toEqual({ limited: false });
  });

  it("never limits unmatched paths", async () => {
    const store = createMemoryStore();
    const limiter = createRateLimiter({ store, groups: [authGroup] });
    for (let i = 0; i < 10; i++) {
      expect(await limiter.checkPath("/dashboard", "1.2.3.4")).toEqual({ limited: false });
    }
  });
});

describe("createRateLimiter — limiting behavior", () => {
  it("limits after the group's threshold and reports retryAfter", async () => {
    let t = 1_000_000;
    const limiter = createRateLimiter({
      store: createMemoryStore({ now: () => t }),
      groups: [authGroup],
      now: () => t,
    });

    expect((await limiter.checkPath("/login", "ip1")).limited).toBe(false);
    expect((await limiter.checkPath("/login", "ip1")).limited).toBe(false);

    const third = await limiter.checkPath("/login", "ip1");
    expect(third.limited).toBe(true);
    expect(third.retryAfter).toBe(60); // full window remaining

    t += 30_000;
    const later = await limiter.checkPath("/login", "ip1");
    expect(later.limited).toBe(true);
    expect(later.retryAfter).toBe(30);

    t += 31_000; // first hit now outside the window
    expect((await limiter.checkPath("/login", "ip1")).limited).toBe(false);
  });

  it("separates buckets by client key and by group", async () => {
    const store = createMemoryStore();
    const limiter = createRateLimiter({ store, groups: [authGroup, apiGroup] });

    await limiter.checkPath("/login", "ip1");
    await limiter.checkPath("/login", "ip1");
    expect((await limiter.checkPath("/login", "ip1")).limited).toBe(true);
    // different client, same path → own bucket
    expect((await limiter.checkPath("/login", "ip2")).limited).toBe(false);
    // same client, different group → own bucket
    expect((await limiter.checkPath("/api/data", "ip1")).limited).toBe(false);
  });

  it("separates buckets by path segment inside one group (default keySegment)", async () => {
    const store = createMemoryStore();
    const limiter = createRateLimiter({ store, groups: [authGroup] });

    await limiter.checkPath("/login/forgot-password", "ip1");
    await limiter.checkPath("/login/forgot-password", "ip1");
    expect((await limiter.checkPath("/login/forgot-password", "ip1")).limited).toBe(true);
    // sibling endpoint has its own bucket
    expect((await limiter.checkPath("/login/reset-password", "ip1")).limited).toBe(false);
  });

  it("check() limits a direct key against a named group (Server Action use)", async () => {
    const limiter = createRateLimiter({ store: createMemoryStore(), groups: [authGroup] });
    expect((await limiter.check("auth", "user-1")).limited).toBe(false);
    expect((await limiter.check("auth", "user-1")).limited).toBe(false);
    expect((await limiter.check("auth", "user-1")).limited).toBe(true);
    expect((await limiter.check("auth", "user-2")).limited).toBe(false);
  });

  it("retryAfter is at least 1 second", async () => {
    let t = 0;
    const store: RateLimitStore = {
      limit: async () => ({ success: false, reset: t + 100 }), // resets in 0.1s
    };
    const limiter = createRateLimiter({ store, groups: [authGroup], now: () => t });
    const res = await limiter.check("auth", "k");
    expect(res).toEqual({ limited: true, retryAfter: 1 });
  });
});

describe("createMemoryStore", () => {
  it("implements a sliding window (old hits expire continuously)", async () => {
    let t = 0;
    const store = createMemoryStore({ now: () => t });

    expect((await store.limit("k", 2, 1000)).success).toBe(true); // t=0
    t = 400;
    expect((await store.limit("k", 2, 1000)).success).toBe(true); // t=400
    t = 800;
    expect((await store.limit("k", 2, 1000)).success).toBe(false); // both in window
    t = 1100; // first hit (t=0) expired, second (t=400) remains
    expect((await store.limit("k", 2, 1000)).success).toBe(true);
    t = 1200; // window holds t=400? no (expired at 1400? 400+1000=1400 > 1200 → still in) …
    expect((await store.limit("k", 2, 1000)).success).toBe(false); // t=1100 and t=400 in window
  });

  it("reset points at when the oldest in-window hit expires", async () => {
    let t = 0;
    const store = createMemoryStore({ now: () => t });
    await store.limit("k", 1, 1000); // hit at t=0
    t = 500;
    const denied = await store.limit("k", 1, 1000);
    expect(denied.success).toBe(false);
    expect(denied.reset).toBe(1000); // 0 + 1000
  });

  it("keys are independent", async () => {
    const store = createMemoryStore();
    expect((await store.limit("a", 1, 60_000)).success).toBe(true);
    expect((await store.limit("b", 1, 60_000)).success).toBe(true);
    expect((await store.limit("a", 1, 60_000)).success).toBe(false);
  });
});

describe("prefixMatcher", () => {
  it("matches any of the prefixes", () => {
    const match = prefixMatcher(["/login", "/signup"]);
    expect(match("/login/forgot-password")).toBe(true);
    expect(match("/signup")).toBe(true);
    expect(match("/dashboard")).toBe(false);
  });
});
