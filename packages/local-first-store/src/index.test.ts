import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  debounceStorage,
  versionStorage,
  upsertById,
  removeById,
  type SyncStringStorage,
} from "./index.js";

function memoryStorage(): SyncStringStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => void map.set(name, value),
    removeItem: (name) => void map.delete(name),
    dump: () => Object.fromEntries(map),
  };
}

describe("debounceStorage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays writes and coalesces rapid updates into the last value", () => {
    const base = memoryStorage();
    const storage = debounceStorage(base, 400);

    storage.setItem("k", "v1");
    storage.setItem("k", "v2");
    storage.setItem("k", "v3");
    expect(base.getItem("k")).toBeNull(); // not yet flushed

    vi.advanceTimersByTime(400);
    expect(base.getItem("k")).toBe("v3"); // single write, last value
  });

  it("getItem returns the pending value while a write is in flight", () => {
    const base = memoryStorage();
    const storage = debounceStorage(base, 400);
    base.setItem("k", "old");

    storage.setItem("k", "new");
    expect(storage.getItem("k")).toBe("new"); // read-your-writes
    expect(base.getItem("k")).toBe("old");
  });

  it("flush() writes immediately (beforeunload safety)", () => {
    const base = memoryStorage();
    const storage = debounceStorage(base, 400);

    storage.setItem("k", "v");
    storage.flush();
    expect(base.getItem("k")).toBe("v");

    // no double write when the timer would have fired later
    base.setItem("k", "manual");
    vi.advanceTimersByTime(400);
    expect(base.getItem("k")).toBe("manual");
  });

  it("removeItem cancels a pending write for the same key", () => {
    const base = memoryStorage();
    const storage = debounceStorage(base, 400);

    storage.setItem("k", "v");
    storage.removeItem("k");
    vi.advanceTimersByTime(400);
    expect(base.getItem("k")).toBeNull();
  });
});

describe("versionStorage", () => {
  const snapshot = (version: number) =>
    JSON.stringify({ state: { version, items: [1, 2] } });

  it("returns matching-version snapshots as-is", () => {
    const base = memoryStorage();
    base.setItem("k", snapshot(4));
    expect(versionStorage(base, 4).getItem("k")).toBe(snapshot(4));
  });

  it("discards snapshots with a stale version", () => {
    const base = memoryStorage();
    base.setItem("k", snapshot(3));
    expect(versionStorage(base, 4).getItem("k")).toBeNull();
  });

  it("discards unparseable and shape-mismatched snapshots", () => {
    const base = memoryStorage();
    base.setItem("k", "not json {{{");
    expect(versionStorage(base, 4).getItem("k")).toBeNull();
    base.setItem("k", JSON.stringify({ nothing: true }));
    expect(versionStorage(base, 4).getItem("k")).toBeNull();
  });

  it("returns null when the key is missing", () => {
    expect(versionStorage(memoryStorage(), 4).getItem("missing")).toBeNull();
  });

  it("supports a custom version selector", () => {
    const base = memoryStorage();
    base.setItem("k", JSON.stringify({ v: 7 }));
    const storage = versionStorage(base, 7, {
      getVersion: (parsed) => (parsed as { v?: number }).v,
    });
    expect(storage.getItem("k")).not.toBeNull();
  });

  it("writes pass through untouched", () => {
    const base = memoryStorage();
    versionStorage(base, 4).setItem("k", "raw");
    expect(base.getItem("k")).toBe("raw");
  });
});

describe("upsertById", () => {
  const a = { id: "a", name: "A" };
  const b = { id: "b", name: "B" };

  it("inserts new items at the front (newest-first)", () => {
    const list = upsertById(upsertById([], a), b);
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("replaces existing items in place without reordering", () => {
    const list = upsertById([b, a], { id: "a", name: "A2" });
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
    expect(list[1]).toEqual({ id: "a", name: "A2" });
  });

  it("does not mutate the input list", () => {
    const input = [a];
    upsertById(input, b);
    expect(input).toEqual([a]);
  });
});

describe("removeById", () => {
  it("removes by id and is a no-op for unknown ids", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(removeById(list, "a").map((x) => x.id)).toEqual(["b"]);
    expect(removeById(list, "zzz")).toHaveLength(2);
  });
});

describe("composition (versioned + debounced, zustand-persist style)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stale snapshot is discarded, fresh write round-trips", () => {
    const base = memoryStorage();
    base.setItem("store", JSON.stringify({ state: { version: 1 } }));

    const storage = versionStorage(debounceStorage(base, 100), 2);
    expect(storage.getItem("store")).toBeNull(); // stale version dropped

    const fresh = JSON.stringify({ state: { version: 2, customers: [] } });
    storage.setItem("store", fresh);
    vi.advanceTimersByTime(100);
    expect(storage.getItem("store")).toBe(fresh);
  });
});
