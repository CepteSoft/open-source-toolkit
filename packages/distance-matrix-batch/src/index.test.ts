import { describe, it, expect, vi } from "vitest";
import {
  createDistanceMatrixClient,
  DEFAULT_MESSAGES,
  type FetchLike,
  type DistanceMatrixDestination,
} from "./index.js";

function okResponse(elementCount: number, opts: { failIndexes?: number[] } = {}) {
  const { failIndexes = [] } = opts;
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: "OK",
      rows: [
        {
          elements: Array.from({ length: elementCount }, (_, i) =>
            failIndexes.includes(i)
              ? { status: "ZERO_RESULTS" }
              : {
                  status: "OK",
                  duration: { value: 600 + i, text: `${10 + i} mins` },
                  distance: { value: 5000 + i, text: `${5 + i} km` },
                }
          ),
        },
      ],
    }),
  };
}

function destinations(n: number): DistanceMatrixDestination[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `stop-${i}`,
    destination: `39.7${i},30.4${i}`,
  }));
}

describe("createDistanceMatrixClient", () => {
  it("throws at init without an apiKey (programmer error)", () => {
    expect(() => createDistanceMatrixClient({ apiKey: "" })).toThrow();
    expect(() => createDistanceMatrixClient({ apiKey: "   " })).toThrow();
  });

  it("builds the request URL from origin, destinations, key, and mode", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => okResponse(2));
    const client = createDistanceMatrixClient({ apiKey: "test-key", fetch: fetchMock });

    await client.getDistanceMatrix({ lat: 39.75, lng: 30.49 }, destinations(2));

    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.searchParams.get("origins")).toBe("39.75,30.49");
    expect(url.searchParams.get("destinations")).toBe("39.70,30.40|39.71,30.41");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("mode")).toBe("driving");
  });

  it("maps results back to destination ids and omits unreachable stops", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => okResponse(3, { failIndexes: [1] }));
    const client = createDistanceMatrixClient({ apiKey: "k", fetch: fetchMock });

    const res = await client.getDistanceMatrix("39.75,30.49", destinations(3));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.results.map((r) => r.id)).toEqual(["stop-0", "stop-2"]);
      expect(res.results[0]!.duration.value).toBe(600);
      expect(res.results[0]!.distance?.value).toBe(5000);
    }
  });

  it("splits into batches of maxBatchSize and flattens results", async () => {
    const fetchMock = vi.fn<FetchLike>(async (url) => {
      const count = new URL(url).searchParams.get("destinations")!.split("|").length;
      return okResponse(count);
    });
    const client = createDistanceMatrixClient({
      apiKey: "k",
      fetch: fetchMock,
      maxBatchSize: 25,
    });

    const res = await client.getDistanceMatrix("0,0", destinations(60));
    expect(fetchMock).toHaveBeenCalledTimes(3); // 25 + 25 + 10
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.results).toHaveLength(60);
  });

  it("caps total destinations at maxDestinations", async () => {
    const fetchMock = vi.fn<FetchLike>(async (url) => {
      const count = new URL(url).searchParams.get("destinations")!.split("|").length;
      return okResponse(count);
    });
    const client = createDistanceMatrixClient({
      apiKey: "k",
      fetch: fetchMock,
      maxBatchSize: 25,
      maxDestinations: 30,
    });

    const res = await client.getDistanceMatrix("0,0", destinations(100));
    expect(fetchMock).toHaveBeenCalledTimes(2); // 25 + 5
    if (res.ok) expect(res.results).toHaveLength(30);
  });

  it("returns { ok: true, results: [] } for zero destinations without fetching", async () => {
    const fetchMock = vi.fn<FetchLike>();
    const client = createDistanceMatrixClient({ apiKey: "k", fetch: fetchMock });
    expect(await client.getDistanceMatrix("0,0", [])).toEqual({ ok: true, results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails the whole call when any batch fails", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(okResponse(2))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const client = createDistanceMatrixClient({ apiKey: "k", fetch: fetchMock, maxBatchSize: 2 });

    const res = await client.getDistanceMatrix("0,0", destinations(4));
    expect(res).toEqual({ ok: false, error: "HTTP 500" });
  });

  it("surfaces API error_message and non-OK status", async () => {
    const client = createDistanceMatrixClient({
      apiKey: "k",
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "REQUEST_DENIED", error_message: "Key is invalid" }),
      }),
    });
    expect(await client.getDistanceMatrix("0,0", destinations(1))).toEqual({
      ok: false,
      error: "Key is invalid",
    });

    const client2 = createDistanceMatrixClient({
      apiKey: "k",
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "OVER_QUERY_LIMIT" }),
      }),
    });
    expect(await client2.getDistanceMatrix("0,0", destinations(1))).toEqual({
      ok: false,
      error: "OVER_QUERY_LIMIT",
    });
  });

  it("converts network throws into { ok: false } with the (overridable) message", async () => {
    const failing: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    const client = createDistanceMatrixClient({ apiKey: "k", fetch: failing });
    const res = await client.getDistanceMatrix("0,0", destinations(1));
    expect(res).toEqual({ ok: false, error: `${DEFAULT_MESSAGES.requestFailed}: ECONNRESET` });

    const tr = createDistanceMatrixClient({
      apiKey: "k",
      fetch: failing,
      messages: { requestFailed: "İstek hatası" },
    });
    expect(await tr.getDistanceMatrix("0,0", destinations(1))).toEqual({
      ok: false,
      error: "İstek hatası: ECONNRESET",
    });
  });

  it("handles unparseable JSON bodies", async () => {
    const client = createDistanceMatrixClient({
      apiKey: "k",
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    });
    expect(await client.getDistanceMatrix("0,0", destinations(1))).toEqual({
      ok: false,
      error: DEFAULT_MESSAGES.parseFailed,
    });
  });

  it("returns empty results when element count mismatches the batch (defensive)", async () => {
    const client = createDistanceMatrixClient({
      apiKey: "k",
      fetch: async () => okResponse(1),
    });
    const res = await client.getDistanceMatrix("0,0", destinations(3));
    expect(res).toEqual({ ok: true, results: [] });
  });

  it("passes language and endpoint overrides through", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => okResponse(1));
    const client = createDistanceMatrixClient({
      apiKey: "k",
      fetch: fetchMock,
      language: "tr",
      endpoint: "https://proxy.example.com/dm",
    });
    await client.getDistanceMatrix("0,0", destinations(1));
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe("https://proxy.example.com/dm");
    expect(url.searchParams.get("language")).toBe("tr");
  });
});
