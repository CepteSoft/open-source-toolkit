/**
 * Timezone-correct calendar days.
 *
 * `new Date().toISOString().slice(0, 10)` returns the *UTC* day — for a
 * business in Istanbul (UTC+3) every evening after 21:00 UTC-local logic is
 * off by one day, silently corrupting date-keyed orders and planning.
 * These helpers compute the day in the timezone the *business* lives in.
 *
 * Implementation: `toLocaleDateString("en-CA")` — the `en-CA` locale formats
 * as `YYYY-MM-DD`, giving an ISO day with zero dependencies.
 */

/**
 * The calendar day (`YYYY-MM-DD`) for `instant` (default: now) in the given
 * IANA timezone (e.g. `"Europe/Istanbul"`).
 *
 * Throws a `RangeError` for invalid timezone identifiers — that's a
 * programmer error, not an input error.
 */
export function isoDayInTimeZone(timeZone: string, instant: Date = new Date()): string {
  return instant.toLocaleDateString("en-CA", { timeZone });
}

/**
 * Convenience factory when the whole app shares one business timezone:
 *
 * ```ts
 * const today = createTodayFn("Europe/Istanbul");
 * today(); // "2026-07-09"
 * ```
 *
 * Validates the timezone once at creation (throws early on typos instead of
 * on first use in production).
 */
export function createTodayFn(timeZone: string): () => string {
  // Fail fast on invalid identifiers.
  isoDayInTimeZone(timeZone);
  return () => isoDayInTimeZone(timeZone);
}
