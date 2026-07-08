import { describe, it, expect, vi, afterEach } from "vitest";
import { isoDayInTimeZone, createTodayFn } from "./index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("isoDayInTimeZone", () => {
  it("returns a YYYY-MM-DD string for now by default", () => {
    expect(isoDayInTimeZone("Europe/Istanbul")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("one minute before Istanbul midnight (20:59 UTC) is still the same day", () => {
    // 20:59 UTC = 23:59 Istanbul (UTC+3)
    expect(isoDayInTimeZone("Europe/Istanbul", new Date("2025-06-15T20:59:00Z"))).toBe(
      "2025-06-15"
    );
  });

  it("one minute after Istanbul midnight (21:01 UTC) is the next day", () => {
    // 21:01 UTC = 00:01 Istanbul
    expect(isoDayInTimeZone("Europe/Istanbul", new Date("2025-06-15T21:01:00Z"))).toBe(
      "2025-06-16"
    );
  });

  it("year boundary: 22:30 UTC Dec 31 is already Jan 1 in Istanbul", () => {
    expect(isoDayInTimeZone("Europe/Istanbul", new Date("2025-12-31T22:30:00Z"))).toBe(
      "2026-01-01"
    );
  });

  it("westward zones lag UTC: 02:00 UTC is still the previous day in New York", () => {
    // 02:00 UTC = 22:00 (EDT, UTC-4) the previous day
    expect(isoDayInTimeZone("America/New_York", new Date("2025-06-16T02:00:00Z"))).toBe(
      "2025-06-15"
    );
  });

  it("throws on an invalid timezone identifier (programmer error)", () => {
    expect(() => isoDayInTimeZone("Europe/Atlantis")).toThrow(RangeError);
  });
});

describe("createTodayFn", () => {
  it("returns a function bound to the timezone, using the current clock", () => {
    const today = createTodayFn("Europe/Istanbul");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T21:01:00Z")); // 00:01 Istanbul, Jun 16
    expect(today()).toBe("2025-06-16");
  });

  it("fails fast at creation for invalid timezones", () => {
    expect(() => createTodayFn("Not/AZone")).toThrow(RangeError);
  });
});
