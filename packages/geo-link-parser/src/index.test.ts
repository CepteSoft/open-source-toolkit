import { describe, it, expect, vi } from "vitest";
import {
  normalizeLocation,
  parseLocationLink,
  isValidLatLng,
  type FetchLike,
} from "./index.js";

describe("normalizeLocation — stored coordinates take precedence", () => {
  it("returns coord string when latitude/longitude are present", async () => {
    const result = await normalizeLocation({ link: null, latitude: 39.75, longitude: 30.49 });
    expect(result).toBe("39.75,30.49");
  });

  it("accepts coordinates as strings", async () => {
    const result = await normalizeLocation({ link: null, latitude: "39.75", longitude: "30.49" });
    expect(result).toBe("39.75,30.49");
  });

  it("falls through to the link when coordinates are missing", async () => {
    const result = await normalizeLocation({
      link: "https://maps.google.com/?q=39.75,30.49",
      latitude: null,
      longitude: null,
    });
    expect(result).toBe("39.75,30.49");
  });

  it("falls through to the link when coordinates are out of bounds", async () => {
    expect(
      await normalizeLocation({
        link: "https://www.google.com/maps?q=39.75,30.49",
        latitude: 91,
        longitude: 30.49,
      })
    ).toBe("39.75,30.49");
    expect(
      await normalizeLocation({
        link: "https://www.google.com/maps?q=39.75,30.49",
        latitude: 39.75,
        longitude: 181,
      })
    ).toBe("39.75,30.49");
  });
});

describe("normalizeLocation — Google Maps link formats", () => {
  it("maps?q=lat,lng", async () => {
    expect(
      await normalizeLocation({ link: "https://www.google.com/maps?q=39.75,30.49" })
    ).toBe("39.75,30.49");
  });

  it("@lat,lng path format", async () => {
    expect(
      await normalizeLocation({
        link: "https://www.google.com/maps/place/Eskisehir/@39.75,30.49,13z",
      })
    ).toBe("39.75,30.49");
  });

  it("maps/search/?query=lat,lng", async () => {
    expect(
      await normalizeLocation({ link: "https://www.google.com/maps/search/?query=39.75,30.49" })
    ).toBe("39.75,30.49");
  });

  it("q= with an address returns the address text", async () => {
    expect(
      await normalizeLocation({ link: "https://www.google.com/maps?q=Eskisehir+Merkez" })
    ).toBe("Eskisehir Merkez");
  });
});

describe("normalizeLocation — empty/invalid input", () => {
  it("null link and no coordinates → null", async () => {
    expect(await normalizeLocation({ link: null })).toBeNull();
  });

  it("empty link and no coordinates → null", async () => {
    expect(await normalizeLocation({ link: "" })).toBeNull();
  });
});

describe("normalizeLocation — short links (injected fetch)", () => {
  it("resolves a goo.gl short link via the injected fetch", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => ({
      url: "https://www.google.com/maps/place/X/@39.75,30.49,13z",
    }));
    const result = await normalizeLocation(
      { link: "https://maps.app.goo.gl/abc123" },
      { fetch: fetchMock }
    );
    expect(result).toBe("39.75,30.49");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://maps.app.goo.gl/abc123");
  });

  it("retries with the second user agent when the first result is unparseable", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({ url: "https://consent.google.com/nothing-here" })
      .mockResolvedValueOnce({ url: "https://www.google.com/maps?q=39.75,30.49" });
    const result = await normalizeLocation(
      { link: "https://goo.gl/xyz" },
      { fetch: fetchMock }
    );
    expect(result).toBe("39.75,30.49");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when resolution fails entirely (fetch throws)", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      throw new Error("offline");
    });
    expect(
      await normalizeLocation({ link: "https://goo.gl/xyz" }, { fetch: fetchMock })
    ).toBeNull();
  });

  it("does not fetch for non-short-link hosts", async () => {
    const fetchMock = vi.fn<FetchLike>();
    await normalizeLocation(
      { link: "https://www.google.com/maps?q=39.75,30.49" },
      { fetch: fetchMock }
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("parseLocationLink", () => {
  it("parses data=!3d!4d params", () => {
    expect(
      parseLocationLink("https://www.google.com/maps/preview?data=!3d39.75!4d30.49")
    ).toBe("39.75,30.49");
  });

  it("parses ll= params", () => {
    expect(parseLocationLink("https://maps.google.com/?ll=39.75,30.49")).toBe("39.75,30.49");
  });

  it("parses bare lat,lng text (not a URL)", () => {
    expect(parseLocationLink("konum: 39.75,30.49")).toBe("39.75,30.49");
  });

  it("returns null for empty or coordinate-free text", () => {
    expect(parseLocationLink("")).toBeNull();
    expect(parseLocationLink("hello world")).toBeNull();
  });

  it("rejects out-of-range bare coordinates", () => {
    expect(parseLocationLink("99.9,30.49")).toBeNull();
  });

  it("treats out-of-range q= pairs as address text (documented fallback)", () => {
    expect(parseLocationLink("https://maps.google.com/?q=95.0,30.49")).toBe("95.0,30.49");
  });
});

describe("isValidLatLng", () => {
  it("accepts in-range pairs", () => {
    expect(isValidLatLng(39.75, 30.49)).toBe(true);
    expect(isValidLatLng(-90, 180)).toBe(true);
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng(0, Infinity)).toBe(false);
  });
});
