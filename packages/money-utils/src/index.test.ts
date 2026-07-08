import { describe, it, expect } from "vitest";
import {
  toNumber,
  parseAmount,
  DEFAULT_MAX_AMOUNT,
  DEFAULT_AMOUNT_MESSAGES,
  netFromGross,
  vatAmount,
  grossFromNet,
  createCurrencyRegistry,
} from "./index.js";

describe("toNumber", () => {
  it("returns 0 for null, undefined and empty string", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("")).toBe(0);
  });

  it("parses integer strings", () => {
    expect(toNumber("0")).toBe(0);
    expect(toNumber("1234")).toBe(1234);
  });

  it("parses dot decimals (English format)", () => {
    expect(toNumber("1234.50")).toBe(1234.5);
    expect(toNumber("0.99")).toBe(0.99);
  });

  it("parses comma decimals (Turkish/European format)", () => {
    expect(toNumber("1234,50")).toBe(1234.5);
    expect(toNumber("0,99")).toBe(0.99);
  });

  it("parses negatives", () => {
    expect(toNumber("-100")).toBe(-100);
    expect(toNumber("-1234,50")).toBe(-1234.5);
  });

  it("returns 0 for invalid strings and non-finite values", () => {
    expect(toNumber("abc")).toBe(0);
    expect(toNumber("12abc")).toBe(12); // parseFloat prefix behavior
    expect(toNumber("NaN")).toBe(0);
    expect(toNumber("Infinity")).toBe(0);
    expect(toNumber(NaN)).toBe(0);
    expect(toNumber(Infinity)).toBe(0);
  });

  it("passes through finite numbers", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
  });
});

describe("parseAmount", () => {
  it("accepts and normalizes valid amounts", () => {
    expect(parseAmount("1234.5")).toEqual({ ok: true, value: "1234.5" });
    expect(parseAmount("1234,56")).toEqual({ ok: true, value: "1234.56" });
    expect(parseAmount("0")).toEqual({ ok: true, value: "0" });
    expect(parseAmount(42)).toEqual({ ok: true, value: "42" });
  });

  it("rounds to 2 decimals by default", () => {
    expect(parseAmount("1.005")).toEqual({ ok: true, value: "1.01" });
    expect(parseAmount("9.999")).toEqual({ ok: true, value: "10" });
  });

  it("supports 3 decimals via maxDecimals (stock/weight)", () => {
    expect(parseAmount("9.999", { maxDecimals: 3 })).toEqual({ ok: true, value: "9.999" });
  });

  it("rejects NaN / Infinity (prevents SQL SUM poisoning)", () => {
    expect(parseAmount("NaN").ok).toBe(false);
    expect(parseAmount("Infinity").ok).toBe(false);
    expect(parseAmount(NaN).ok).toBe(false);
    expect(parseAmount(Infinity).ok).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(parseAmount("-1").ok).toBe(false);
    expect(parseAmount(-100).ok).toBe(false);
  });

  it("rejects overflow above max, accepts max itself", () => {
    expect(parseAmount("1e308").ok).toBe(false);
    expect(parseAmount(String(DEFAULT_MAX_AMOUNT + 1)).ok).toBe(false);
    expect(parseAmount(String(DEFAULT_MAX_AMOUNT)).ok).toBe(true);
    expect(parseAmount("11", { max: 10 }).ok).toBe(false);
  });

  it("empty: rejected when required, '0' when optional", () => {
    expect(parseAmount("")).toEqual({ ok: false, error: DEFAULT_AMOUNT_MESSAGES.empty });
    expect(parseAmount(null).ok).toBe(false);
    expect(parseAmount("   ").ok).toBe(false);
    expect(parseAmount("", { required: false })).toEqual({ ok: true, value: "0" });
  });

  it("messages are overridable per call (localization)", () => {
    const messages = { negative: "Tutar negatif olamaz." };
    expect(parseAmount("-5", { messages })).toEqual({
      ok: false,
      error: "Tutar negatif olamaz.",
    });
    // untouched keys keep their defaults
    expect(parseAmount("", { messages })).toEqual({
      ok: false,
      error: DEFAULT_AMOUNT_MESSAGES.empty,
    });
  });
});

describe("VAT math", () => {
  it("netFromGross: 110 gross at 10% → 100 net; 120 at 20% → 100", () => {
    expect(netFromGross(110, 10)).toBeCloseTo(100, 5);
    expect(netFromGross(120, 20)).toBeCloseTo(100, 5);
  });

  it("netFromGross: 0% rate leaves gross unchanged; zero stays zero", () => {
    expect(netFromGross(100, 0)).toBe(100);
    expect(netFromGross(0, 18)).toBe(0);
  });

  it("vatAmount: 110 at 10% → 10; 120 at 20% → 20; 0% → 0", () => {
    expect(vatAmount(110, 10)).toBeCloseTo(10, 5);
    expect(vatAmount(120, 20)).toBeCloseTo(20, 5);
    expect(vatAmount(100, 0)).toBe(0);
  });

  it("grossFromNet: 100 net + 10% → 110; + 20% → 120; 0% → net", () => {
    expect(grossFromNet(100, 10)).toBeCloseTo(110, 5);
    expect(grossFromNet(100, 20)).toBeCloseTo(120, 5);
    expect(grossFromNet(100, 0)).toBe(100);
  });

  it("grossFromNet inverts netFromGross", () => {
    const gross = 118;
    const rate = 18;
    expect(grossFromNet(netFromGross(gross, rate), rate)).toBeCloseTo(gross, 5);
  });
});

describe("createCurrencyRegistry", () => {
  const registry = createCurrencyRegistry([
    { code: "TRY", symbol: "₺", label: "Türk Lirası" },
    { code: "USD", symbol: "$", label: "Dolar" },
  ]);

  it("returns the symbol for a known code", () => {
    expect(registry.getSymbol("USD")).toBe("$");
  });

  it("falls back to the first (default) currency for empty codes", () => {
    expect(registry.getSymbol(null)).toBe("₺");
    expect(registry.getSymbol(undefined)).toBe("₺");
    expect(registry.getSymbol("")).toBe("₺");
  });

  it("returns the code itself for unknown codes", () => {
    expect(registry.getSymbol("JPY")).toBe("JPY");
  });

  it("getCurrency returns the full definition or undefined", () => {
    expect(registry.getCurrency("TRY")).toEqual({
      code: "TRY",
      symbol: "₺",
      label: "Türk Lirası",
    });
    expect(registry.getCurrency("JPY")).toBeUndefined();
    expect(registry.getCurrency(null)).toBeUndefined();
  });

  it("throws at init when the list is empty (programmer error)", () => {
    expect(() => createCurrencyRegistry([])).toThrow();
  });
});
