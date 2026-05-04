import { describe, expect, it, vi } from "vitest";
import { defaultClient } from "@/pipeline/src/sources/reddit/client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function errorResponse(status: number, body = "boom", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe("reddit client — fetchListing", () => {
  it("constructs URL with t, limit, raw_json params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 50 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.origin + url.pathname).toBe("https://www.reddit.com/r/neovim/top.json");
    expect(url.searchParams.get("t")).toBe("week");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("raw_json")).toBe("1");
  });

  it("sets a User-Agent header containing 'this-week-in-neovim'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = defaultClient({ fetch: fetchMock, sleep: vi.fn() });

    await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("this-week-in-neovim");
  });

  it("retries on 429 honoring Retry-After (seconds)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "rate limited", { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    const result = await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("retries 5xx with exponential backoff (1s, 2s, 4s)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(errorResponse(503));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    await expect(
      client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 }),
    ).rejects.toThrow(/503/);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const backoffCalls = sleep.mock.calls.map((c) => c[0]);
    expect(backoffCalls).toContain(1000);
    expect(backoffCalls).toContain(2000);
    expect(backoffCalls).not.toContain(4000);
  });

  it("retries 5xx and waits 4s before the third attempt when needed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    const result = await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });
    expect(result).toEqual({ ok: true });
    const backoffCalls = sleep.mock.calls.map((c) => c[0]);
    expect(backoffCalls).toContain(1000);
    expect(backoffCalls).toContain(2000);
  });

  it("throws synchronously on 404 without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404, "not found"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    await expect(
      client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 }),
    ).rejects.toThrow(/404.*not found/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("includes a status + body excerpt in 4xx error messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(403, "forbidden body"));
    const client = defaultClient({ fetch: fetchMock, sleep: vi.fn() });

    await expect(
      client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 }),
    ).rejects.toThrow(/403.*forbidden body/);
  });

  it("waits 1s between consecutive successful calls", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });
    await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const waitedFor1000 = sleep.mock.calls.some((c) => c[0] === 1000);
    expect(waitedFor1000).toBe(true);
  });

  it("does not sleep before the first call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });

    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("reddit client — fetchComments", () => {
  it("constructs URL with permalink + limit + depth + raw_json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{}, {}]));
    const client = defaultClient({ fetch: fetchMock, sleep: vi.fn() });

    await client.fetchComments("/r/neovim/comments/abc123/title_slug/", { limit: 20, depth: 1 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.origin + url.pathname).toBe(
      "https://www.reddit.com/r/neovim/comments/abc123/title_slug/.json",
    );
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("depth")).toBe("1");
    expect(url.searchParams.get("raw_json")).toBe("1");
  });

  it("defaults limit=20 and depth=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{}, {}]));
    const client = defaultClient({ fetch: fetchMock, sleep: vi.fn() });

    await client.fetchComments("/r/neovim/comments/abc123/x/");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("depth")).toBe("1");
  });

  it("sets the same identifying User-Agent on comment fetches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{}, {}]));
    const client = defaultClient({ fetch: fetchMock, sleep: vi.fn() });

    await client.fetchComments("/r/neovim/comments/abc123/x/");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("this-week-in-neovim");
  });

  it("retries 5xx responses on comment fetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(jsonResponse([{}, {}]));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: fetchMock, sleep });

    await client.fetchComments("/r/neovim/comments/abc123/x/");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const waitedFor1000 = sleep.mock.calls.some((c) => c[0] === 1000);
    expect(waitedFor1000).toBe(true);
  });
});
