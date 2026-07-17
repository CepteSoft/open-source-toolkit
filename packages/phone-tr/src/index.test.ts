import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  parsePhone,
  isValidPhone,
  getLineType,
  formatPhone,
  DEFAULT_INVALID_MESSAGE,
} from "./index.js";

describe("normalizePhone", () => {
  it("returns null for empty or whitespace-only", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("adds leading 0 for 10 digits starting with 5", () => {
    expect(normalizePhone("532 111 22 33")).toBe("05321112233");
    expect(normalizePhone("5321112233")).toBe("05321112233");
  });

  it("leaves 11 digits starting with 0 unchanged (digits only)", () => {
    expect(normalizePhone("0532 111 22 33")).toBe("05321112233");
  });

  it("strips 90 country code (12 digits)", () => {
    expect(normalizePhone("+90 532 111 22 33")).toBe("05321112233");
    expect(normalizePhone("905321112233")).toBe("05321112233");
  });

  it("returns bare digits for unrecognized shapes", () => {
    expect(normalizePhone("123")).toBe("123");
  });
});

describe("parsePhone", () => {
  it("accepts empty as optional (value null, no error)", () => {
    expect(parsePhone("")).toEqual({ value: null, error: null });
    expect(parsePhone("   ")).toEqual({ value: null, error: null });
    expect(parsePhone(null)).toEqual({ value: null, error: null });
  });

  it("accepts valid 11-digit number starting with 0", () => {
    expect(parsePhone("0532 111 22 33")).toEqual({ value: "05321112233", error: null });
    expect(parsePhone("532 111 22 33")).toEqual({ value: "05321112233", error: null });
  });

  it("accepts valid 0 + 10 digits (e.g. landline)", () => {
    const r = parsePhone("0212 555 00 00");
    expect(r.error).toBeNull();
    expect(r.value).toBe("02125550000");
  });

  it("rejects too short number with the default message", () => {
    const r = parsePhone("0532 111");
    expect(r.value).toBeNull();
    expect(r.error).toBe(DEFAULT_INVALID_MESSAGE);
  });

  it("supports a custom invalid message", () => {
    const r = parsePhone("0532 111", { invalidMessage: "Invalid TR phone." });
    expect(r.error).toBe("Invalid TR phone.");
  });
});

describe("isValidPhone", () => {
  it("returns false for null or empty", () => {
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("returns true for 11 digits starting with 0", () => {
    expect(isValidPhone("05321112233")).toBe(true);
  });

  it("returns false for wrong length or prefix", () => {
    expect(isValidPhone("0532111")).toBe(false);
    expect(isValidPhone("15321112233")).toBe(false);
  });
});

describe("getLineType", () => {
  it("5xx → mobile (any accepted input form)", () => {
    expect(getLineType("05321112233")).toBe("mobile");
    expect(getLineType("+90 532 111 22 33")).toBe("mobile");
    expect(getLineType("5051112233")).toBe("mobile");
  });

  it("2xx/3xx/4xx → landline", () => {
    expect(getLineType("02125550000")).toBe("landline");
    expect(getLineType("03122220000")).toBe("landline");
    expect(getLineType("04421110000")).toBe("landline");
  });

  it("850 corporate, 800 tollfree, 900 premium", () => {
    expect(getLineType("08501234567")).toBe("corporate");
    expect(getLineType("08001234567")).toBe("tollfree");
    expect(getLineType("09001234567")).toBe("premium");
  });

  it("valid but unclassified range → unknown", () => {
    expect(getLineType("08221234567")).toBe("unknown");
  });

  it("invalid input → null", () => {
    expect(getLineType("0532 111")).toBeNull();
    expect(getLineType(null)).toBeNull();
    expect(getLineType("")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formats as 0XXX XXX XX XX", () => {
    expect(formatPhone("05321112233")).toBe("0532 111 22 33");
    expect(formatPhone("+905321112233")).toBe("0532 111 22 33");
    expect(formatPhone("02125550000")).toBe("0212 555 00 00");
  });

  it("invalid input → null", () => {
    expect(formatPhone("532")).toBeNull();
    expect(formatPhone(null)).toBeNull();
  });
});
