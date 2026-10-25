import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { openBrowserFetch } from "@/pipeline/src/sources/reddit/browser";
import { defaultClient } from "@/pipeline/src/sources/reddit/client";

interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

function fakeBrowser(responses: FakeResponse[], opts: { contexts?: number; gotoError?: Error } = {}) {
  const inPageFetch = vi.fn<typeof fetch>();
  for (const r of responses) {
    inPageFetch.mockResolvedValueOnce(
      new Response(r.body, { status: r.status, headers: r.headers ?? { "content-type": "application/json" } }),
    );
  }

  const page = {
    goto: vi.fn(async () => {
      if (opts.gotoError) throw opts.gotoError;
      return null;
    }),
    evaluate: vi.fn(async (fn: (arg: string) => Promise<unknown>, arg: string) => {
      const realFetch = globalThis.fetch;
      globalThis.fetch = inPageFetch;
      try {
        return await fn(arg);
      } finally {
        globalThis.fetch = realFetch;
      }
    }),
    close: vi.fn(async () => {}),
  };
  const context = { newPage: vi.fn(async () => page) };
  const browser = {
    contexts: vi.fn(() => Array.from({ length: opts.contexts ?? 1 }, () => context)),
    close: vi.fn(async () => {}),
  };
  return {
    browser,
    context,
    page,
    inPageFetch,
    connect: vi.fn(async () => browser as unknown as Browser),
  };
}

describe("reddit browser fetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens one tab in the profile's default context on a static reddit.com page", async () => {
    const fake = fakeBrowser([]);
    await openBrowserFetch("http://127.0.0.1:9222", { connect: fake.connect });

    expect(fake.connect).toHaveBeenCalledWith("http://127.0.0.1:9222");
    expect(fake.context.newPage).toHaveBeenCalledTimes(1);
    expect(fake.page.goto).toHaveBeenCalledWith("https://www.reddit.com/robots.txt", { waitUntil: "domcontentloaded" });
  });

  it("fetches in-page with the session's cookies and returns status, headers, and body", async () => {
    const fake = fakeBrowser([
      { status: 429, headers: { "content-type": "application/json", "retry-after": "3" }, body: "{}" },
    ]);
    const session = await openBrowserFetch("http://x", { connect: fake.connect });

    const res = await session.fetch("https://www.reddit.com/r/neovim/top.json?t=week");

    expect(fake.inPageFetch).toHaveBeenCalledWith("https://www.reddit.com/r/neovim/top.json?t=week", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3");
    expect(await res.text()).toBe("{}");
  });

  it("plugs into defaultClient so pacing, retry, and parsing are unchanged", async () => {
    const fake = fakeBrowser([
      { status: 503, body: "busy" },
      { status: 200, body: JSON.stringify({ kind: "Listing" }) },
    ]);
    const session = await openBrowserFetch("http://x", { connect: fake.connect });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = defaultClient({ fetch: session.fetch, sleep });

    const result = await client.fetchListing({ subreddit: "neovim", timeframe: "week", limit: 5 });

    expect(result).toEqual({ kind: "Listing" });
    expect(fake.inPageFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("fails loudly when Reddit serves HTML (signed out, block page, or challenge)", async () => {
    const fake = fakeBrowser([{ status: 200, headers: { "content-type": "text/html" }, body: "<html>" }]);
    const session = await openBrowserFetch("http://x", { connect: fake.connect });

    await expect(session.fetch("https://www.reddit.com/r/neovim/top.json")).rejects.toThrow(
      /served text\/html .*signed out or challenged/,
    );
  });

  it("names the launcher when Chrome is not reachable", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9222\nCall log: ..."));

    await expect(openBrowserFetch("http://127.0.0.1:9222", { connect })).rejects.toThrow(
      "cannot connect to Chrome at http://127.0.0.1:9222 (connect ECONNREFUSED 127.0.0.1:9222); start it with `pnpm pipeline:chrome`",
    );
  });

  it("disconnects when the browser has no context", async () => {
    const fake = fakeBrowser([], { contexts: 0 });

    await expect(openBrowserFetch("http://x", { connect: fake.connect })).rejects.toThrow(/no browser context/);
    expect(fake.browser.close).toHaveBeenCalledTimes(1);
  });

  it("closes its tab and disconnects if the initial navigation fails", async () => {
    const fake = fakeBrowser([], { gotoError: new Error("net::ERR_NAME_NOT_RESOLVED") });

    await expect(openBrowserFetch("http://x", { connect: fake.connect })).rejects.toThrow("ERR_NAME_NOT_RESOLVED");
    expect(fake.page.close).toHaveBeenCalledTimes(1);
    expect(fake.browser.close).toHaveBeenCalledTimes(1);
  });

  it("close() closes only its own tab, then disconnects", async () => {
    const fake = fakeBrowser([]);
    const session = await openBrowserFetch("http://x", { connect: fake.connect });

    await session.close();

    expect(fake.page.close).toHaveBeenCalledTimes(1);
    expect(fake.browser.close).toHaveBeenCalledTimes(1);
  });

  it("close() tolerates a tab or connection that is already gone", async () => {
    const fake = fakeBrowser([]);
    fake.page.close.mockRejectedValueOnce(new Error("Target closed"));
    fake.browser.close.mockRejectedValueOnce(new Error("Browser closed"));
    const session = await openBrowserFetch("http://x", { connect: fake.connect });

    await expect(session.close()).resolves.toBeUndefined();
  });
});
