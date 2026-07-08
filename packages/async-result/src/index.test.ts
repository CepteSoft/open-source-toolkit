import { describe, it, expect, vi } from "vitest";
import { runWithLoading, err, DEFAULT_UNEXPECTED_ERROR, type Result } from "./index.js";

describe("runWithLoading", () => {
  it("returns the success result untouched; loading set true→false in order", async () => {
    const setLoading = vi.fn();
    const result = await runWithLoading(setLoading, async () => ({ ok: true as const, data: 42 }));
    expect(result).toEqual({ ok: true, data: 42 });
    expect(setLoading.mock.calls).toEqual([[true], [false]]);
  });

  it("passes { ok: false } results through and clears loading", async () => {
    const setLoading = vi.fn();
    const result = await runWithLoading(setLoading, async () => ({ ok: false as const, error: "Nope." }));
    expect(result).toEqual({ ok: false, error: "Nope." });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("converts a throw into the { ok: false } union and clears loading", async () => {
    const setLoading = vi.fn();
    const result = await runWithLoading(setLoading, async () => {
      throw new Error("network down");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DEFAULT_UNEXPECTED_ERROR);
    }
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("clears loading even on a synchronous throw", async () => {
    const setLoading = vi.fn();
    const result = await runWithLoading(setLoading, () => {
      throw new Error("sync boom");
    });
    expect(result.ok).toBe(false);
    expect(setLoading.mock.calls).toEqual([[true], [false]]);
  });

  it("supports a custom unexpected-error message (localization)", async () => {
    const setLoading = vi.fn();
    const result = await runWithLoading(
      setLoading,
      async () => {
        throw new Error("boom");
      },
      { unexpectedErrorMessage: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." }
    );
    expect(result).toEqual({
      ok: false,
      error: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    });
  });

  it("invokes onUnexpectedError with the thrown value", async () => {
    const setLoading = vi.fn();
    const onUnexpectedError = vi.fn();
    const boom = new Error("boom");
    await runWithLoading(
      setLoading,
      async () => {
        throw boom;
      },
      { onUnexpectedError }
    );
    expect(onUnexpectedError).toHaveBeenCalledWith(boom);
  });
});

describe("err", () => {
  it("builds the failure arm", () => {
    expect(err("Not found")).toEqual({ ok: false, error: "Not found" });
  });

  it("supports non-string error types", () => {
    expect(err({ code: 404 })).toEqual({ ok: false, error: { code: 404 } });
  });
});

describe("Result type", () => {
  it("narrows on ok (compile-time check exercised at runtime)", () => {
    const r: Result<{ data: number }> = { ok: true, data: 7 };
    if (r.ok) {
      expect(r.data).toBe(7);
    } else {
      // r.error would be a string here
      expect.unreachable();
    }
  });
});
