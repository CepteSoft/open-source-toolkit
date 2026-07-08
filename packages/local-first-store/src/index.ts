/**
 * Offline-first persistence plumbing, extracted from a production PWA that
 * keeps customers/products/suppliers in a persisted store for local-first
 * reads.
 *
 * The storage decorators are plain-TS and structurally compatible with
 * zustand's `StateStorage` (sync subset), `window.localStorage`, or anything
 * with the same three methods — zustand itself is *not* a dependency.
 */

/**
 * Synchronous string storage: the shape of `window.localStorage` and the
 * sync subset of zustand's `StateStorage`.
 */
export type SyncStringStorage = {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
};

export type DebouncedStorage = SyncStringStorage & {
  /**
   * Writes any pending value immediately. Call on `beforeunload`/`pagehide`
   * so a debounced write isn't lost when the tab closes.
   */
  flush(): void;
};

/**
 * Debounces `setItem` so rapid state updates (typing, bulk sync) don't hit
 * the underlying storage on every change — serializing a large store to
 * localStorage on each keystroke janks the main thread.
 *
 * Read-your-writes: while a write is pending, `getItem` returns the pending
 * value, not the stale persisted one.
 */
export function debounceStorage(
  base: SyncStringStorage,
  debounceMs: number
): DebouncedStorage {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;

  const flush = (): void => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (pending) {
      base.setItem(pending.name, pending.value);
      pending = null;
    }
  };

  return {
    getItem: (name) => {
      if (pending && pending.name === name) return pending.value;
      return base.getItem(name);
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(flush, debounceMs);
    },
    removeItem: (name) => {
      if (pending && pending.name === name) {
        pending = null;
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      }
      base.removeItem(name);
    },
    flush,
  };
}

export type VersionStorageOptions = {
  /**
   * Extracts the version stamp from the parsed JSON snapshot.
   * Default: `parsed.state.version` (a `version` field kept inside a
   * zustand-persist state envelope).
   */
  getVersion?: (parsed: unknown) => unknown;
};

function defaultGetVersion(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const state = (parsed as { state?: unknown }).state;
  if (typeof state !== "object" || state === null) return undefined;
  return (state as { version?: unknown }).version;
}

/**
 * Discards persisted snapshots whose version stamp doesn't match `version`
 * (or that fail to parse) by returning `null` from `getItem` — the store
 * rehydrates from its initial state instead of crashing on a stale schema.
 */
export function versionStorage(
  base: SyncStringStorage,
  version: number,
  options: VersionStorageOptions = {}
): SyncStringStorage {
  const { getVersion = defaultGetVersion } = options;
  return {
    getItem: (name) => {
      const raw = base.getItem(name);
      if (raw == null || typeof raw !== "string") return null;
      try {
        if (getVersion(JSON.parse(raw)) !== version) return null;
      } catch {
        return null;
      }
      return raw;
    },
    setItem: base.setItem.bind(base),
    removeItem: base.removeItem.bind(base),
  };
}

// ─── Keyed-collection helpers ────────────────────────────────────────────────

export type WithId = { id: string };

/**
 * Immutably upserts into a keyed list: a new id is inserted at the front
 * (newest-first lists), an existing id is replaced **in place** so the
 * user's current ordering doesn't jump under them.
 */
export function upsertById<T extends WithId>(list: readonly T[], item: T): T[] {
  const idx = list.findIndex((entry) => entry.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

/** Immutably removes the entry with the given id (no-op when absent). */
export function removeById<T extends WithId>(list: readonly T[], id: string): T[] {
  return list.filter((entry) => entry.id !== id);
}
