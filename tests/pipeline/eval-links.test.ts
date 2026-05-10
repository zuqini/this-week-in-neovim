import { describe, expect, it, vi } from "vitest";
import { checkUrls } from "@/pipeline/src/eval/links";

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("checkUrls", () => {
  it("reports HEAD success without falling back", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    const [out] = await checkUrls(["https://a.example/"], { fetch: fetchMock });
    expect(out).toEqual({
      url: "https://a.example/",
      ok: true,
      status: 200,
      method: "HEAD",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("HEAD");
  });

  it("falls back to GET when HEAD returns 4xx/5xx", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      return init.method === "HEAD" ? res(405) : res(200);
    });
    const [out] = await checkUrls(["https://a.example/"], { fetch: fetchMock });
    expect(out.ok).toBe(true);
    expect(out.method).toBe("GET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports failure when both HEAD and GET fail with HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    const [out] = await checkUrls(["https://a.example/dead"], {
      fetch: fetchMock,
    });
    expect(out).toEqual({
      url: "https://a.example/dead",
      ok: false,
      status: 404,
      method: "GET",
    });
  });

  it("falls back to GET when HEAD throws a network error", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      if (init.method === "HEAD") throw new Error("net err");
      return res(200);
    });
    const [out] = await checkUrls(["https://a.example/"], { fetch: fetchMock });
    expect(out.ok).toBe(true);
    expect(out.method).toBe("GET");
  });

  it("surfaces network errors when GET also throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("net err"));
    const [out] = await checkUrls(["https://a.example/"], { fetch: fetchMock });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("net err");
  });

  it("honors Retry-After on 429 then succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) return res(429, { "Retry-After": "1" });
      return res(200);
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const [out] = await checkUrls(["https://a.example/"], {
      fetch: fetchMock,
      sleep,
    });
    expect(out.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("caps Retry-After waits at retryAfterCapMs", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return res(429, { "Retry-After": "9999" });
      }
      return res(200);
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await checkUrls(["https://a.example/"], {
      fetch: fetchMock,
      sleep,
      retryAfterCapMs: 5000,
    });
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("respects concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return res(200);
    });
    const urls = Array.from({ length: 10 }, (_, i) => `https://a.example/${i}`);
    await checkUrls(urls, { fetch: fetchMock, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("preserves input ordering across concurrent workers", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const delay = url.endsWith("/0") ? 20 : 1;
      await new Promise((r) => setTimeout(r, delay));
      return res(200);
    });
    const urls = Array.from({ length: 5 }, (_, i) => `https://a.example/${i}`);
    const out = await checkUrls(urls, { fetch: fetchMock, concurrency: 4 });
    expect(out.map((r) => r.url)).toEqual(urls);
  });
});
