import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "@/pipeline/bin/enrich-links";

function ok(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } });
}

describe("enrich-links CLI", () => {
  let workdir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "enrich-cli-"));
    stdout = "";
    stderr = "";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((s: string) => {
      stdout += s;
      return true;
    }) as unknown as typeof process.stdout.write);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((s: string) => {
      stderr += s;
      return true;
    }) as unknown as typeof process.stderr.write);
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await rm(workdir, { recursive: true, force: true });
  });

  it("enriches items, writes output, and prints a summary", async () => {
    const date = "2026-05-04";
    const rawDir = path.join(workdir, "raw", date);
    const outDir = path.join(workdir, "enriched", date);
    await mkdir(rawDir, { recursive: true });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/broken/")) throw new Error("net err");
      return ok("# Hello");
    });

    const oldFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    try {
      await writeFile(
        path.join(rawDir, "reddit.json"),
        JSON.stringify({
          source: "test",
          fetchedAt: "2026-05-04T00:00:00.000Z",
          params: {},
          items: [
            { id: "1", url: "https://github.com/folke/lazy.nvim" },
            { id: "2", url: "https://github.com/broken/x" },
            { id: "3", url: "https://v.redd.it/abc" },
          ],
        }),
      );

      const code = await runCli([
        "--date", date,
        "--raw-dir", rawDir,
        "--out-dir", outDir,
        "--concurrency", "2",
      ]);

      expect(code).toBe(0);
      expect(stdout.trim()).toBe("enriched 2 items, skipped 0, failed 1");
      expect(stderr).toContain("https://github.com/broken/x");

      const written = JSON.parse(
        await readFile(path.join(outDir, "reddit.json"), "utf8"),
      );
      expect(written.items).toHaveLength(3);
      expect(written.items[0].linkedContent.kind).toBe("github-readme");
      expect(written.items[1].linkedContent.kind).toBe("fetch-failed");
      expect(written.items[2].linkedContent.kind).toBe("video");
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = oldFetch;
    }
  });

  it("is idempotent: skips items already enriched", async () => {
    const date = "2026-05-04";
    const rawDir = path.join(workdir, "raw", date);
    const outDir = path.join(workdir, "enriched", date);
    await mkdir(rawDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    await writeFile(
      path.join(rawDir, "reddit.json"),
      JSON.stringify({
        source: "test",
        fetchedAt: "2026-05-04T00:00:00.000Z",
        params: {},
        items: [
          { id: "1", url: "https://github.com/folke/lazy.nvim" },
          { id: "2", url: "https://github.com/owner/repo" },
        ],
      }),
    );
    await writeFile(
      path.join(outDir, "reddit.json"),
      JSON.stringify({
        source: "test",
        fetchedAt: "2026-05-04T00:00:00.000Z",
        params: {},
        items: [
          {
            id: "1",
            url: "https://github.com/folke/lazy.nvim",
            linkedContent: {
              kind: "github-readme",
              url: "https://raw.githubusercontent.com/folke/lazy.nvim/HEAD/README.md",
              content: "# cached",
            },
          },
        ],
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue(ok("# fresh"));
    const oldFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    try {
      const code = await runCli([
        "--date", date,
        "--raw-dir", rawDir,
        "--out-dir", outDir,
      ]);
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("enriched 1 items, skipped 1, failed 0");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const written = JSON.parse(
        await readFile(path.join(outDir, "reddit.json"), "utf8"),
      );
      expect(written.items[0].linkedContent.content).toBe("# cached");
      expect(written.items[1].linkedContent.kind).toBe("github-readme");
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = oldFetch;
    }
  });

  it("exits 1 with a clear error when the raw file is missing items[]", async () => {
    const date = "2026-05-04";
    const rawDir = path.join(workdir, "raw", date);
    await mkdir(rawDir, { recursive: true });
    await writeFile(
      path.join(rawDir, "reddit.json"),
      JSON.stringify({ source: "test", fetchedAt: "2026-05-04T00:00:00.000Z", params: {}, posts: [] }),
    );

    const code = await runCli([
      "--raw-dir", rawDir,
      "--out-dir", path.join(workdir, "out"),
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("invalid scrape envelope");
    expect(stderr).toContain("items");
  });

  it("exits 1 when raw dir is missing", async () => {
    const code = await runCli([
      "--raw-dir", path.join(workdir, "does-not-exist"),
      "--out-dir", path.join(workdir, "out"),
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("cannot read raw dir");
  });

  it("exits 1 when raw dir has no .json files", async () => {
    const rawDir = path.join(workdir, "raw");
    await mkdir(rawDir, { recursive: true });
    const code = await runCli([
      "--raw-dir", rawDir,
      "--out-dir", path.join(workdir, "out"),
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("no .json files");
  });
});
