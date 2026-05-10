import { describe, expect, it, vi } from "vitest";
import { enrichBatch } from "@/pipeline/src/enrich/run";

function ok(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } });
}

describe("enrichBatch", () => {
  it("isolates per-item failures", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/broken/")) {
        throw new Error("network kaboom");
      }
      return ok("# Hello");
    });

    const results = await enrichBatch(
      [
        { url: "https://github.com/o/r" },
        { url: "https://github.com/broken/r" },
        { url: "https://github.com/o/r2" },
      ],
      { fetch: fetchMock, concurrency: 2 },
    );

    expect(results).toHaveLength(3);
    expect(results[0].linkedContent?.kind).toBe("github-readme");
    expect(results[1].linkedContent?.kind).toBe("fetch-failed");
    if (results[1].linkedContent && results[1].linkedContent.kind === "fetch-failed") {
      expect(results[1].linkedContent.error).toContain("network kaboom");
    }
    expect(results[2].linkedContent?.kind).toBe("github-readme");
  });

  it("respects concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok("# X");
    });

    const items = Array.from({ length: 10 }, (_, i) => ({
      url: `https://github.com/o/r${i}`,
    }));

    await enrichBatch(items, { fetch: fetchMock, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("invokes onError for each failure with the URL", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    await enrichBatch(
      [{ url: "https://github.com/o/r1" }, { url: "https://github.com/o/r2" }],
      { fetch: fetchMock, onError },
    );
    expect(onError).toHaveBeenCalledTimes(2);
    const urls = onError.mock.calls.map((c) => c[0].url);
    expect(urls).toContain("https://github.com/o/r1");
    expect(urls).toContain("https://github.com/o/r2");
  });

  it("enriches URLs found in reddit-self selftext as linkedContentExtras", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok("# matugen README"));
    const results = await enrichBatch(
      [
        {
          url: "https://www.reddit.com/r/neovim/comments/abc/x/",
          is_self: true,
          selftext:
            "Try [matugen.nvim](https://github.com/daedlock/matugen.nvim). Also https://github.com/daedlock/extra.",
        },
      ],
      { fetch: fetchMock },
    );

    expect(results[0].linkedContent?.kind).toBe("reddit-self");
    expect(results[0].linkedContentExtras).toHaveLength(2);
    expect(results[0].linkedContentExtras![0].kind).toBe("github-readme");
    expect(results[0].linkedContentExtras![1].kind).toBe("github-readme");
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes("daedlock/matugen.nvim"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("daedlock/extra"))).toBe(true);
  });

  it("does not enrich extras for non-self posts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok("# README"));
    const results = await enrichBatch(
      [
        {
          url: "https://github.com/folke/lazy.nvim",
          is_self: false,
          selftext: "",
        },
      ],
      { fetch: fetchMock },
    );
    expect(results[0].linkedContentExtras).toBeUndefined();
  });

  it("omits linkedContentExtras when selftext has no enrichable URLs", async () => {
    const fetchMock = vi.fn();
    const results = await enrichBatch(
      [
        {
          url: "https://www.reddit.com/r/neovim/comments/abc/x/",
          is_self: true,
          selftext: "Just a plain question with no links.",
        },
      ],
      { fetch: fetchMock },
    );
    expect(results[0].linkedContentExtras).toBeUndefined();
  });

  it("excludes the post's own URL from extras", async () => {
    const fetchMock = vi.fn();
    const ownUrl = "https://www.reddit.com/r/neovim/comments/abc/x/";
    const results = await enrichBatch(
      [
        {
          url: ownUrl,
          is_self: true,
          selftext: `Self-link: ${ownUrl}`,
        },
      ],
      { fetch: fetchMock },
    );
    expect(results[0].linkedContentExtras).toBeUndefined();
  });

  it("preserves item ordering across concurrent workers", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const delay = url.includes("r0") ? 20 : 1;
      await new Promise((r) => setTimeout(r, delay));
      return ok(`# ${url}`);
    });
    const items = Array.from({ length: 5 }, (_, i) => ({
      url: `https://github.com/o/r${i}`,
    }));
    const results = await enrichBatch(items, { fetch: fetchMock, concurrency: 4 });
    expect(results.map((r) => r.url)).toEqual(items.map((i) => i.url));
  });
});
