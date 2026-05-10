import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "@/pipeline/bin/eval-draft";

const FRONTMATTER = (sources: Array<{ id: string; url: string }>) =>
  [
    "---",
    "issue: 1",
    'title: "Test issue"',
    "date: 2026-05-04",
    'summary: "Test summary."',
    "sources:",
    ...sources.flatMap((s) => [`  - id: ${s.id}`, `    url: ${s.url}`]),
    "---",
    "",
  ].join("\n");

const PROSE = (extra = "") =>
  [
    "Body intro paragraph here with a few words to satisfy minimum word counts even when bounds are loose.",
    "Another sentence so the eval has enough prose. citation[^s1].",
    extra,
    "",
    "[^s1]: source one.",
    "",
  ].join("\n");

describe("eval-draft CLI", () => {
  let workdir: string;
  let stdout: string;
  let stderr: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let oldFetch: typeof fetch;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "eval-cli-"));
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
    oldFetch = globalThis.fetch;
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    (globalThis as { fetch: typeof fetch }).fetch = oldFetch;
    await rm(workdir, { recursive: true, force: true });
  });

  it("exits 0 when --skip-links and content is valid", async () => {
    const file = path.join(workdir, "2026-05-04.mdx");
    await writeFile(
      file,
      FRONTMATTER([{ id: "s1", url: "https://a.example/" }]) + PROSE(),
    );
    const code = await runCli([file, "--skip-links", "--min-words", "10"]);
    expect(code).toBe(0);
    expect(stdout).toContain("eval-draft: ok");
  });

  it("exits 0 against the real launch issue with mocked 200s", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const code = await runCli([
      path.join(import.meta.dirname, "..", "..", "content", "issues", "2026-05-04.mdx"),
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("eval-draft: ok");
  });

  it("exits 1 with a clear message on a dead URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const file = path.join(workdir, "2026-05-04.mdx");
    await writeFile(
      file,
      FRONTMATTER([{ id: "s1", url: "https://a.example/dead" }]) + PROSE(),
    );
    const code = await runCli([file, "--min-words", "10"]);
    expect(code).toBe(1);
    expect(stderr).toContain("links: 1/1 failed");
    expect(stderr).toContain("https://a.example/dead");
    expect(stderr).toContain("404");
  });

  it("exits 1 on an unresolved citation", async () => {
    const file = path.join(workdir, "2026-05-04.mdx");
    await writeFile(
      file,
      FRONTMATTER([{ id: "s1", url: "https://a.example/" }]) +
        PROSE("Orphan ref[^s99]."),
    );
    const code = await runCli([file, "--skip-links", "--min-words", "10"]);
    expect(code).toBe(1);
    expect(stderr).toContain("citations:");
    expect(stderr).toContain("[^s99]");
  });

  it("exits 1 below minWords with the count and the bound", async () => {
    const file = path.join(workdir, "2026-05-04.mdx");
    await writeFile(
      file,
      FRONTMATTER([{ id: "s1", url: "https://a.example/" }]) + PROSE(),
    );
    const code = await runCli([file, "--skip-links", "--min-words", "10000"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/word count: \d+ below bounds \[10000, \d+\]/);
  });

  it("exits 1 above maxWords with the count and the bound", async () => {
    const file = path.join(workdir, "2026-05-04.mdx");
    await writeFile(
      file,
      FRONTMATTER([{ id: "s1", url: "https://a.example/" }]) + PROSE(),
    );
    const code = await runCli([file, "--skip-links", "--min-words", "1", "--max-words", "5"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/word count: \d+ above bounds \[1, 5\]/);
  });

  it("exits 1 with usage when no path is given", async () => {
    const code = await runCli([]);
    expect(code).toBe(1);
    expect(stderr).toContain("usage:");
  });

  it("exits 1 when --faithfulness is set without --enriched-dir", async () => {
    const file = path.join(workdir, "2026-05-04.mdx");
    await writeFile(
      file,
      FRONTMATTER([{ id: "s1", url: "https://a.example/" }]) + PROSE(),
    );
    const code = await runCli([file, "--skip-links", "--faithfulness"]);
    expect(code).toBe(1);
    expect(stderr).toContain("--enriched-dir");
  });
});
