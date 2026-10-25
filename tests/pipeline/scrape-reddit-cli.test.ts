import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  openBrowserFetch: vi.fn(),
}));

vi.mock("@/pipeline/src/sources/reddit/browser", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openBrowserFetch: browserMock.openBrowserFetch,
}));

const { runCli } = await import("@/pipeline/bin/scrape-reddit");

const EMPTY_LISTING = { kind: "Listing", data: { children: [], after: null, before: null } };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("scrape-reddit CLI", () => {
  let workdir: string;
  let oldFetch: typeof fetch;
  let stderr: string;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "scrape-reddit-"));
    oldFetch = globalThis.fetch;
    stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    browserMock.openBrowserFetch.mockReset();
  });

  afterEach(async () => {
    globalThis.fetch = oldFetch;
    vi.restoreAllMocks();
    await rm(workdir, { recursive: true, force: true });
  });

  it("routes requests through the browser session when --cdp-url is set, then closes it", async () => {
    const sessionFetch = vi.fn().mockResolvedValue(jsonResponse(EMPTY_LISTING));
    const close = vi.fn().mockResolvedValue(undefined);
    browserMock.openBrowserFetch.mockResolvedValue({ fetch: sessionFetch, close });
    globalThis.fetch = vi.fn() as typeof fetch;

    const code = await runCli(["--cdp-url=http://127.0.0.1:9333", "--no-comments", `--out-dir=${workdir}`]);

    expect(code).toBe(0);
    expect(browserMock.openBrowserFetch).toHaveBeenCalledWith("http://127.0.0.1:9333");
    expect(sessionFetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("bare --cdp-url defaults to http://127.0.0.1:9222", async () => {
    browserMock.openBrowserFetch.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(jsonResponse(EMPTY_LISTING)),
      close: vi.fn().mockResolvedValue(undefined),
    });

    await runCli(["--cdp-url", "--no-comments", `--out-dir=${workdir}`]);

    expect(browserMock.openBrowserFetch).toHaveBeenCalledWith("http://127.0.0.1:9222");
  });

  it("closes the browser session even when the scrape fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    browserMock.openBrowserFetch.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(new Response("nope", { status: 403 })),
      close,
    });

    const code = await runCli(["--cdp-url", "--no-comments", `--out-dir=${workdir}`]);

    expect(code).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(stderr).toContain("hint: is the Chrome profile at http://127.0.0.1:9222 signed into Reddit?");
  });

  it("points logged-out 403s at --cdp-url", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 })) as typeof fetch;

    const code = await runCli(["--no-comments", `--out-dir=${workdir}`]);

    expect(code).toBe(1);
    expect(browserMock.openBrowserFetch).not.toHaveBeenCalled();
    expect(stderr).toContain("Reddit request failed: 403");
    expect(stderr).toContain("hint: Reddit blocks logged-out .json access; re-run with --cdp-url");
  });

  it("reports a Chrome connection failure and writes nothing", async () => {
    browserMock.openBrowserFetch.mockRejectedValue(new Error("cannot connect to Chrome at http://127.0.0.1:9222"));

    const code = await runCli(["--cdp-url", `--out-dir=${workdir}`]);

    expect(code).toBe(1);
    expect(stderr).toContain("scrape-reddit: cannot connect to Chrome");
    expect(await readdir(workdir)).toEqual([]);
  });
});
