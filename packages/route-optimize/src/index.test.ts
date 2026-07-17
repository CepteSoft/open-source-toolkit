import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  parseLatLngString,
  solveTour,
  approxTourMeters,
  formatApproxKm,
  buildGoogleMapsDirUrl,
  buildNavDirUrl,
  buildNavLegUrls,
  MAX_MAPS_STOPS,
  NAV_STOP_LIMITS,
  type LatLng,
  type RouteStop,
} from "./index.js";

const ISTANBUL: LatLng = { lat: 41.0082, lng: 28.9784 };
const ANKARA: LatLng = { lat: 39.9334, lng: 32.8597 };

describe("haversineMeters", () => {
  it("same point → 0", () => {
    expect(haversineMeters(ISTANBUL, ISTANBUL)).toBe(0);
  });

  it("Istanbul–Ankara ≈ 351 km", () => {
    const d = haversineMeters(ISTANBUL, ANKARA);
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(360_000);
  });

  it("symmetric: d(a,b) === d(b,a)", () => {
    expect(haversineMeters(ISTANBUL, ANKARA)).toBeCloseTo(haversineMeters(ANKARA, ISTANBUL), 6);
  });
});

describe("parseLatLngString", () => {
  it('parses a "lat,lng" string into a coordinate', () => {
    expect(parseLatLngString("39.75,30.49")).toEqual({ lat: 39.75, lng: 30.49 });
    expect(parseLatLngString(" 41.0 , 28.9 ")).toEqual({ lat: 41.0, lng: 28.9 });
  });

  it("address text / null / missing part → null", () => {
    expect(parseLatLngString("Main street 42, some town")).toBeNull();
    expect(parseLatLngString(null)).toBeNull();
    expect(parseLatLngString("39.75")).toBeNull();
    expect(parseLatLngString("")).toBeNull();
  });

  it("out-of-range coordinate → null", () => {
    expect(parseLatLngString("95,30")).toBeNull();
    expect(parseLatLngString("39,190")).toBeNull();
  });
});

describe("solveTour", () => {
  // Points on the same meridian (lng=0) — distances are proportional to latitude deltas.
  const at = (id: string, lat: number): RouteStop => ({ id, lat, lng: 0 });
  const origin: LatLng = { lat: 0, lng: 0 };

  it("empty and single stop: returned as-is", () => {
    expect(solveTour(origin, [])).toEqual([]);
    expect(solveTour(origin, [at("A", 0.02)])).toEqual(["A"]);
  });

  it("with two stops the closer one comes first", () => {
    expect(solveTour(origin, [at("FAR", 0.05), at("NEAR", 0.01)])).toEqual(["NEAR", "FAR"]);
  });

  it("2-opt fixes the nearest-neighbor zigzag (back first, then one forward sweep)", () => {
    // NN goes origin → A(0.01) → B(0.011), then backtracks to D(-0.01), then runs to C(0.05).
    // Optimal open path: D → A → B → C (a single sweep end to end).
    const stops = [at("A", 0.01), at("B", 0.011), at("C", 0.05), at("D", -0.01)];
    expect(solveTour(origin, stops)).toEqual(["D", "A", "B", "C"]);
  });

  it("result is always a permutation of all stops", () => {
    const stops = [at("A", 0.03), at("B", -0.02), at("C", 0.01), at("D", 0.07), at("E", -0.05)];
    const result = solveTour(origin, stops);
    expect([...result].sort()).toEqual(["A", "B", "C", "D", "E"]);
  });
});

describe("approxTourMeters", () => {
  it("equals the sum of leg distances", () => {
    const a: LatLng = { lat: 0.01, lng: 0 };
    const b: LatLng = { lat: 0.03, lng: 0 };
    const origin: LatLng = { lat: 0, lng: 0 };
    const expected = haversineMeters(origin, a) + haversineMeters(a, b);
    expect(approxTourMeters(origin, [a, b])).toBeCloseTo(expected, 6);
  });

  it("empty tour → 0", () => {
    expect(approxTourMeters({ lat: 0, lng: 0 }, [])).toBe(0);
  });
});

describe("formatApproxKm", () => {
  it("10 km and above: whole numbers", () => {
    expect(formatApproxKm(62_000)).toBe("~62 km");
    expect(formatApproxKm(10_400)).toBe("~10 km");
  });

  it("below 10 km: one decimal (en-US dot by default)", () => {
    expect(formatApproxKm(3_400)).toBe("~3.4 km");
    expect(formatApproxKm(900)).toBe("~0.9 km");
  });

  it("locale option controls the decimal separator", () => {
    expect(formatApproxKm(3_400, { locale: "tr-TR" })).toBe("~3,4 km");
    expect(formatApproxKm(3_400, { locale: "de-DE" })).toBe("~3,4 km");
  });
});

describe("buildGoogleMapsDirUrl", () => {
  const origin: LatLng = { lat: 41, lng: 29 };
  const stop = (lat: number): LatLng => ({ lat, lng: 30 });

  it("empty list → null", () => {
    expect(buildGoogleMapsDirUrl(origin, [])).toBeNull();
  });

  it("single stop: destination only, no waypoints", () => {
    const result = buildGoogleMapsDirUrl(origin, [stop(39.5)]);
    expect(result).not.toBeNull();
    const url = new URL(result!.url);
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("41,29");
    expect(url.searchParams.get("destination")).toBe("39.5,30");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("waypoints")).toBeNull();
  });

  it("three stops: last is the destination, first two are ordered waypoints", () => {
    const result = buildGoogleMapsDirUrl(origin, [stop(39.1), stop(39.2), stop(39.3)]);
    const url = new URL(result!.url);
    expect(url.searchParams.get("destination")).toBe("39.3,30");
    expect(url.searchParams.get("waypoints")).toBe("39.1,30|39.2,30");
    expect(result!.includedCount).toBe(3);
    expect(result!.totalCount).toBe(3);
  });

  it("12 stops: truncated to the first 10 (9 waypoints + destination)", () => {
    const stops = Array.from({ length: 12 }, (_, i) => stop(39 + i * 0.1));
    const result = buildGoogleMapsDirUrl(origin, stops);
    expect(result!.includedCount).toBe(MAX_MAPS_STOPS);
    expect(result!.totalCount).toBe(12);
    const url = new URL(result!.url);
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(MAX_MAPS_STOPS - 1);
    // Destination = the 10th stop in order (index 9)
    expect(url.searchParams.get("destination")).toBe(`${39 + 9 * 0.1},30`);
  });
});

describe("buildNavDirUrl", () => {
  const origin: LatLng = { lat: 41, lng: 29 };
  const stop = (lat: number): LatLng => ({ lat, lng: 30 });

  it("empty list → null for every target", () => {
    for (const target of ["google", "apple", "yandex", "waze"] as const) {
      expect(buildNavDirUrl(target, origin, [])).toBeNull();
    }
  });

  it('"google" matches buildGoogleMapsDirUrl', () => {
    const stops = [stop(39.1), stop(39.2)];
    expect(buildNavDirUrl("google", origin, stops)).toEqual(buildGoogleMapsDirUrl(origin, stops));
  });

  it('"yandex": origin + stops chained in rtext, rtt=auto', () => {
    const result = buildNavDirUrl("yandex", origin, [stop(39.1), stop(39.2), stop(39.3)]);
    const url = new URL(result!.url);
    expect(url.hostname).toBe("yandex.com");
    expect(url.searchParams.get("mode")).toBe("routes");
    expect(url.searchParams.get("rtt")).toBe("auto");
    expect(url.searchParams.get("rtext")).toBe("41,29~39.1,30~39.2,30~39.3,30");
    expect(result!.includedCount).toBe(3);
  });

  it('"yandex": 12 stops truncated to its limit (origin + 10 points in rtext)', () => {
    const stops = Array.from({ length: 12 }, (_, i) => stop(39 + i * 0.1));
    const result = buildNavDirUrl("yandex", origin, stops);
    expect(result!.includedCount).toBe(NAV_STOP_LIMITS.yandex);
    expect(result!.totalCount).toBe(12);
    const url = new URL(result!.url);
    expect(url.searchParams.get("rtext")!.split("~")).toHaveLength(NAV_STOP_LIMITS.yandex + 1);
  });

  it('"apple": single destination = FIRST stop, saddr origin, driving flag', () => {
    const result = buildNavDirUrl("apple", origin, [stop(39.1), stop(39.2)]);
    const url = new URL(result!.url);
    expect(url.hostname).toBe("maps.apple.com");
    expect(url.searchParams.get("saddr")).toBe("41,29");
    expect(url.searchParams.get("daddr")).toBe("39.1,30");
    expect(url.searchParams.get("dirflg")).toBe("d");
    expect(result!.includedCount).toBe(1);
    expect(result!.totalCount).toBe(2);
  });

  it('"waze": single destination = FIRST stop, no origin (starts from current location)', () => {
    const result = buildNavDirUrl("waze", origin, [stop(39.1), stop(39.2)]);
    const url = new URL(result!.url);
    expect(url.hostname).toBe("waze.com");
    expect(url.pathname).toBe("/ul");
    expect(url.searchParams.get("ll")).toBe("39.1,30");
    expect(url.searchParams.get("navigate")).toBe("yes");
    expect(url.searchParams.get("from")).toBeNull();
    expect(result!.includedCount).toBe(1);
  });
});

describe("buildNavLegUrls", () => {
  const origin: LatLng = { lat: 41, lng: 29 };
  const stop = (lat: number): LatLng => ({ lat, lng: 30 });

  it("empty stops → empty array", () => {
    expect(buildNavLegUrls("google", origin, [])).toEqual([]);
  });

  it("one URL per leg, chained origins (google)", () => {
    const urls = buildNavLegUrls("google", origin, [stop(39.1), stop(39.2)]);
    expect(urls).toHaveLength(2);
    const first = new URL(urls[0]!);
    expect(first.searchParams.get("origin")).toBe("41,29");
    expect(first.searchParams.get("destination")).toBe("39.1,30");
    const second = new URL(urls[1]!);
    expect(second.searchParams.get("origin")).toBe("39.1,30");
    expect(second.searchParams.get("destination")).toBe("39.2,30");
  });

  it("waze legs carry only the destination", () => {
    const urls = buildNavLegUrls("waze", origin, [stop(39.1), stop(39.2)]);
    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]!).searchParams.get("ll")).toBe("39.1,30");
    expect(new URL(urls[1]!).searchParams.get("ll")).toBe("39.2,30");
  });
});
