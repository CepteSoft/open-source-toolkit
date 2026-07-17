/**
 * Turkish phone number normalization and validation.
 *
 * Canonical form is the 11-digit national format `0XXXXXXXXXX`
 * (e.g. `05321112233` for mobile, `02125550000` for landline).
 */

const DIGITS_ONLY = /[0-9]/g;
const VALID_PHONE = /^0[0-9]{10}$/;

/** Default (Turkish) validation message; override via {@link ParsePhoneOptions}. */
export const DEFAULT_INVALID_MESSAGE =
  "Geçerli bir telefon numarası girin (11 hane, örn. 05XX XXX XX XX).";

/**
 * Extracts digits and converts to the Turkish canonical form (`0XXXXXXXXXX`):
 * - 10 digits starting with `5` → leading `0` is prepended.
 * - 11 digits starting with `0` → kept as-is (digits only).
 * - 12 digits starting with `90` (country code) → `0` + last 10 digits.
 * - Anything else → returned as bare digits (validate with {@link isValidPhone}).
 *
 * Returns `null` for empty or whitespace-only input.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const digits = (input.trim().match(DIGITS_ONLY) ?? []).join("");
  if (digits.length === 0) return null;
  if (digits.length === 10 && digits.startsWith("5")) return "0" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("90")) return "0" + digits.slice(2);
  return digits;
}

/**
 * Whether a normalized phone is valid (11 digits, starts with `0`).
 * Acts as a type guard so `string | null` narrows to `string`.
 */
export function isValidPhone(value: string | null): value is string {
  if (value == null || value.length === 0) return false;
  return VALID_PHONE.test(value);
}

export type ParsePhoneOptions = {
  /** Message returned when the input is present but not a valid TR number. */
  invalidMessage?: string;
};

export type ParsePhoneResult = {
  /** Canonical `0XXXXXXXXXX` string, or `null` when empty/invalid. */
  value: string | null;
  /** Populated only when the input was present but invalid. */
  error: string | null;
};

/**
 * Normalizes the input; returns the canonical value when valid, or `null`
 * plus an error message when invalid. Empty input is treated as an optional
 * field: `{ value: null, error: null }`.
 */
export function parsePhone(
  input: string | null | undefined,
  options: ParsePhoneOptions = {}
): ParsePhoneResult {
  const { invalidMessage = DEFAULT_INVALID_MESSAGE } = options;
  const normalized = normalizePhone(input);
  if (normalized === null) return { value: null, error: null };
  if (!isValidPhone(normalized)) {
    return { value: null, error: invalidMessage };
  }
  return { value: normalized, error: null };
}

/**
 * Line type derived from the Turkish national numbering plan:
 * `5xx` mobile, `2xx`/`3xx`/`4xx` geographic landline, `850` nongeographic
 * corporate/VoIP, `800` toll-free, `900` premium-rate.
 *
 * Deliberately NOT operator detection: Turkey has had mobile number
 * portability since 2008, so a prefix only tells the original allocation,
 * not the subscriber's current operator.
 */
export type PhoneLineType =
  | "mobile"
  | "landline"
  | "corporate"
  | "tollfree"
  | "premium"
  | "unknown";

/**
 * Classifies a phone by line type. Accepts anything {@link normalizePhone}
 * accepts; returns `null` when the input does not normalize to a valid
 * number, `"unknown"` for valid-but-unclassified ranges.
 */
export function getLineType(input: string | null | undefined): PhoneLineType | null {
  const normalized = normalizePhone(input);
  if (!isValidPhone(normalized)) return null;
  const first = normalized[1];
  if (first === "5") return "mobile";
  if (first === "2" || first === "3" || first === "4") return "landline";
  const prefix = normalized.slice(1, 4);
  if (prefix === "850") return "corporate";
  if (prefix === "800") return "tollfree";
  if (prefix === "900") return "premium";
  return "unknown";
}

/**
 * Formats for display as `0XXX XXX XX XX` (e.g. `0532 111 22 33`).
 * Returns `null` when the input does not normalize to a valid number.
 */
export function formatPhone(input: string | null | undefined): string | null {
  const normalized = normalizePhone(input);
  if (!isValidPhone(normalized)) return null;
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7, 9)} ${normalized.slice(9, 11)}`;
}
