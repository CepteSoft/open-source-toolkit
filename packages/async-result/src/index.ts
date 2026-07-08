/**
 * `{ ok, error }` result convention + a loading-flag wrapper that can't leak.
 *
 * The convention: expected failures are *returned*, not thrown. Server
 * mutations return `({ ok: true } & Extra) | { ok: false; error: string }`
 * and the UI branches on `result.ok`. `throw` stays reserved for programmer
 * errors.
 */

/** The failure arm of the convention. */
export type Failure<E = string> = { ok: false; error: E };

/**
 * A success carrying extra fields (spread convention:
 * `{ ok: true, data: … }`), or a failure with an error.
 */
export type Result<T extends object = Record<never, never>, E = string> =
  | ({ ok: true } & T)
  | Failure<E>;

/** Builds a failure: `err("Not found")` → `{ ok: false, error: "Not found" }`. */
export function err<E = string>(error: E): Failure<E> {
  return { ok: false, error };
}

export const DEFAULT_UNEXPECTED_ERROR =
  "An unexpected error occurred. Please try again.";

export type RunWithLoadingOptions = {
  /** Message used when `fn` throws (network failure etc.). */
  unexpectedErrorMessage?: string;
  /** Called with the thrown value when `fn` throws (logging/telemetry hook). */
  onUnexpectedError?: (thrown: unknown) => void;
};

/**
 * Wraps an async call with a loading flag that is guaranteed to clear in
 * every outcome — success, returned `{ ok: false }`, thrown error, even a
 * synchronous throw. Throws are converted into the `{ ok: false }` union so
 * a UI can never get stuck on "Loading…".
 *
 * ```ts
 * const result = await runWithLoading(setLoading, () => someAction(args));
 * if (!result.ok) { setError(result.error); return; }
 * ```
 *
 * `setLoading` is a plain callback — wire it to React state, a store, or
 * anything else.
 */
export async function runWithLoading<T extends { ok: boolean }>(
  setLoading: (loading: boolean) => void,
  fn: () => Promise<T> | T,
  options: RunWithLoadingOptions = {}
): Promise<T | Failure<string>> {
  const {
    unexpectedErrorMessage = DEFAULT_UNEXPECTED_ERROR,
    onUnexpectedError,
  } = options;
  setLoading(true);
  try {
    return await fn();
  } catch (thrown) {
    onUnexpectedError?.(thrown);
    return { ok: false, error: unexpectedErrorMessage };
  } finally {
    setLoading(false);
  }
}
