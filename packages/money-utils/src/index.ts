/**
 * Monetary parsing, VAT math, and currency registry for ERP-style apps.
 *
 * Design notes:
 * - `parseAmount` exists because SQL `numeric` columns accept `'NaN'`, and a
 *   single NaN poisons every `SUM()` over the column. Non-finite input is
 *   therefore rejected, not coerced.
 * - Comma decimals ("1234,50") are accepted everywhere — Turkish and most
 *   European locales type them.
 */

// ─── Lenient numeric coercion ────────────────────────────────────────────────

/**
 * Coerces a string/number/null/undefined to a finite number (comma decimals
 * accepted). Invalid or empty input returns `0` — use this for display math
 * over values you already trust, and {@link parseAmount} at trust boundaries.
 */
export function toNumber(input: string | number | null | undefined): number {
  if (input == null || input === "") return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const n = parseFloat(String(input).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// ─── Strict amount validation (trust boundary) ───────────────────────────────

/** Default maximum accepted amount (1 trillion). Blocks overflow abuse. */
export const DEFAULT_MAX_AMOUNT = 1_000_000_000_000;

export type AmountParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export type AmountMessages = {
  empty: string;
  invalid: string;
  negative: string;
  tooLarge: string;
};

export const DEFAULT_AMOUNT_MESSAGES: AmountMessages = {
  empty: "Amount is required.",
  invalid: "Invalid amount.",
  negative: "Amount cannot be negative.",
  tooLarge: "Amount is too large.",
};

export type ParseAmountOptions = {
  /** Reject empty input (default `true`); when `false`, empty parses to `"0"`. */
  required?: boolean;
  /** Upper bound, inclusive (default {@link DEFAULT_MAX_AMOUNT}). */
  max?: number;
  /** Decimal places to round to (default `2`; use `3` for weights, etc.). */
  maxDecimals?: number;
  /** Override any of the error messages (e.g. for localization). */
  messages?: Partial<AmountMessages>;
};

/**
 * Validates and normalizes user-entered monetary/numeric input for writing to
 * a database. Rejects NaN/Infinity, negatives, and values above `max`.
 *
 * Returns a canonical number string (dot decimal separator, rounded to
 * `maxDecimals`) suitable for SQL `numeric` columns.
 */
export function parseAmount(
  input: string | number | null | undefined,
  options: ParseAmountOptions = {}
): AmountParseResult {
  const {
    required = true,
    max = DEFAULT_MAX_AMOUNT,
    maxDecimals = 2,
    messages,
  } = options;
  const msg: AmountMessages = { ...DEFAULT_AMOUNT_MESSAGES, ...messages };

  if (input == null || (typeof input === "string" && input.trim() === "")) {
    return required ? { ok: false, error: msg.empty } : { ok: true, value: "0" };
  }

  const n =
    typeof input === "number"
      ? input
      : parseFloat(String(input).replace(",", "."));

  if (!Number.isFinite(n)) return { ok: false, error: msg.invalid };
  if (n < 0) return { ok: false, error: msg.negative };
  if (n > max) return { ok: false, error: msg.tooLarge };

  const factor = 10 ** maxDecimals;
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor;
  return { ok: true, value: String(rounded) };
}

// ─── VAT (KDV) math ──────────────────────────────────────────────────────────
// Rates are percentages (e.g. `20` for 20% VAT).

/** Net (VAT-exclusive) amount from a gross (VAT-inclusive) amount. */
export function netFromGross(gross: number, ratePercent: number): number {
  return gross / (1 + ratePercent / 100);
}

/** VAT portion contained in a gross (VAT-inclusive) amount. */
export function vatAmount(gross: number, ratePercent: number): number {
  return gross - netFromGross(gross, ratePercent);
}

/** Gross (VAT-inclusive) amount from a net (VAT-exclusive) amount. */
export function grossFromNet(net: number, ratePercent: number): number {
  return net * (1 + ratePercent / 100);
}

// ─── Currency registry ───────────────────────────────────────────────────────

export type CurrencyDefinition = {
  /** ISO 4217 code, e.g. `"TRY"`. */
  code: string;
  /** Display symbol, e.g. `"₺"`. */
  symbol: string;
  /** Human-readable label, e.g. `"Türk Lirası"`. */
  label: string;
};

export type CurrencyRegistry = {
  /** The definitions the registry was created with. */
  currencies: readonly CurrencyDefinition[];
  /**
   * Symbol for a code; falls back to the default currency's symbol for
   * empty input, and to the code itself for unknown codes.
   */
  getSymbol(code: string | null | undefined): string;
  /** Full definition for a code, or `undefined` when unknown. */
  getCurrency(code: string | null | undefined): CurrencyDefinition | undefined;
};

/**
 * Builds a lookup over the currencies *your* app supports. The first entry is
 * the default (used when a stored code is null/empty).
 */
export function createCurrencyRegistry(
  currencies: readonly CurrencyDefinition[]
): CurrencyRegistry {
  if (currencies.length === 0) {
    throw new Error("createCurrencyRegistry requires at least one currency.");
  }
  const byCode = new Map(currencies.map((c) => [c.code, c]));
  const fallback = currencies[0]!;
  return {
    currencies,
    getSymbol(code) {
      if (!code) return fallback.symbol;
      return byCode.get(code)?.symbol ?? code;
    },
    getCurrency(code) {
      if (!code) return undefined;
      return byCode.get(code);
    },
  };
}
