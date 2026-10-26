import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  github: vi.fn<(argv: string[]) => Promise<number>>(),
  awesome: vi.fn<(argv: string[]) => Promise<number>>(),
  reddit: vi.fn<(argv: string[]) => Promise<number>>(),
  enrich: vi.fn<(argv: string[]) => Promise<number>>(),
}));

vi.mock("@/pipeline/bin/scrape-github-releases", () => ({ runCli: mocks.github }));
vi.mock("@/pipeline/bin/scrape-awesome-neovim", () => ({ runCli: mocks.awesome }));
vi.mock("@/pipeline/bin/scrape-reddit", () => ({ runCli: mocks.reddit }));
vi.mock("@/pipeline/bin/enrich-links", () => ({ runCli: mocks.enrich }));

const { runCli } = await import("@/pipeline/bin/week");

const DATE = "2026-11-02";

interface Summary {
  date: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  steps: Array<{
    name: string;
    ok: boolean;
    exitCode: number;
    durationMs: number;
    summary: string | null;
    error?: string;
  }>;
  rawFiles: string[];
}

describe("pipeline:week CLI", () => {
  let dataDir: string;
  let stdout: string;
  let stderr: string;
  let calls: string[];

  const writesRaw = (name: string, file: string) => async () => {
    calls.push(name);
    const dir = path.join(dataDir, "raw", DATE);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, file), "{}");
    utimesSync(path.join(dir, file), new Date(), new Date());
    process.stdout.write(`wrote 1 item → ${path.join(dir, file)}\n`);
    return 0;
  };

  const readSummary = async (): Promise<Summary> =>
    JSON.parse(await readFile(path.join(dataDir, "runs", `${DATE}.json`), "utf8"));

  const step = (summary: Summary, name: string) => summary.steps.find((s) => s.name === name)!;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${DATE}T06:00:00Z`));
    dataDir = await mkdtemp(path.join(tmpdir(), "week-cli-"));
    stdout = "";
    stderr = "";
    calls = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    mocks.github.mockReset().mockImplementation(writesRaw("github-releases", "github-neovim-neovim-releases.json"));
    mocks.awesome.mockReset().mockImplementation(writesRaw("awesome-neovim", "awesome-neovim-additions.json"));
    mocks.reddit.mockReset().mockImplementation(writesRaw("reddit", "reddit-neovim.json"));
    mocks.enrich.mockReset().mockImplementation(async () => {
      calls.push("enrich");
      process.stdout.write("enriched 3 items, skipped 0, failed 0\n");
      return 0;
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("runs every scraper then enrich, and exits 0 when all succeed", async () => {
    const code = await runCli([`--data-dir=${dataDir}`]);

    expect(code).toBe(0);
    expect(calls).toEqual(["github-releases", "awesome-neovim", "reddit", "enrich"]);
    const raw = path.join(dataDir, "raw");
    expect(mocks.github).toHaveBeenCalledWith([
      `--out-dir=${raw}`,
      "--out-name=github-neovim-neovim-releases.json",
    ]);
    expect(mocks.awesome).toHaveBeenCalledWith([
      `--out-dir=${raw}`,
      "--out-name=awesome-neovim-additions.json",
    ]);
    expect(mocks.reddit).toHaveBeenCalledWith([
      "--subreddit=neovim",
      "--limit=25",
      "--cdp-url",
      `--out-dir=${raw}`,
    ]);
    expect(mocks.enrich).toHaveBeenCalledWith(["--date", DATE, "--root", dataDir]);

    const summary = await readSummary();
    expect(summary.date).toBe(DATE);
    expect(summary.ok).toBe(true);
    expect(summary.steps.map((s) => s.name)).toEqual([
      "github-releases",
      "awesome-neovim",
      "reddit",
      "enrich",
    ]);
    expect(summary.steps.every((s) => s.ok && s.exitCode === 0 && s.error === undefined)).toBe(true);
    expect(step(summary, "enrich").summary).toBe("enriched 3 items, skipped 0, failed 0");
    expect(summary.rawFiles).toEqual([
      "awesome-neovim-additions.json",
      "github-neovim-neovim-releases.json",
      "reddit-neovim.json",
    ]);
  });

  it("prints one line naming ok and failed steps and the summary path", async () => {
    mocks.reddit.mockImplementation(async () => {
      process.stderr.write("scrape-reddit: boom\n");
      return 1;
    });

    await runCli([`--data-dir=${dataDir}`]);

    const lines = stdout.split("\n").filter((l) => l.startsWith("pipeline:week"));
    expect(lines).toEqual([
      `pipeline:week ${DATE}: ok github-releases, awesome-neovim, enrich; FAILED reddit → ${path.join(dataDir, "runs", `${DATE}.json`)}`,
    ]);
  });

  it("records a failed reddit scrape with its stderr hint, still enriches, and exits 2", async () => {
    mocks.reddit.mockImplementation(async () => {
      calls.push("reddit");
      process.stderr.write("scrape-reddit: Reddit request failed: 403 Forbidden\n");
      process.stderr.write("scrape-reddit: hint: is the Chrome profile at http://127.0.0.1:9222 signed into Reddit?\n");
      return 1;
    });

    const code = await runCli([`--data-dir=${dataDir}`]);

    expect(code).toBe(2);
    expect(calls).toContain("enrich");
    const summary = await readSummary();
    expect(summary.ok).toBe(false);
    const reddit = step(summary, "reddit");
    expect(reddit).toMatchObject({ ok: false, exitCode: 1, summary: null });
    expect(reddit.error).toContain("403 Forbidden");
    expect(reddit.error).toContain("signed into Reddit?");
    expect(step(summary, "github-releases").error).toBeUndefined();
    expect(summary.rawFiles).toEqual([
      "awesome-neovim-additions.json",
      "github-neovim-neovim-releases.json",
    ]);
    expect(stderr).toContain("hint:");
  });

  it("keeps only the last 20 non-empty stderr lines of a failed step", async () => {
    mocks.reddit.mockImplementation(async () => {
      for (let i = 1; i <= 25; i++) process.stderr.write(`line ${i}\n\n`);
      return 1;
    });

    await runCli([`--data-dir=${dataDir}`]);

    const error = step(await readSummary(), "reddit").error!.split("\n");
    expect(error).toHaveLength(20);
    expect(error[0]).toBe("line 6");
    expect(error[19]).toBe("line 25");
  });

  it("records a throwing step as failed, with its partial output, and keeps going", async () => {
    mocks.github.mockImplementation(async () => {
      process.stdout.write("fetching releases\n");
      process.stderr.write("retrying after 502\n");
      throw new Error("socket hang up");
    });

    const code = await runCli([`--data-dir=${dataDir}`]);

    expect(code).toBe(2);
    expect(mocks.awesome).toHaveBeenCalled();
    expect(mocks.reddit).toHaveBeenCalled();
    expect(mocks.enrich).toHaveBeenCalled();
    expect(step(await readSummary(), "github-releases")).toMatchObject({
      ok: false,
      exitCode: 1,
      summary: "fetching releases",
      error: "retrying after 502\nthrew: socket hang up",
    });
  });

  it("fails a scraper that exits 0 without writing today's file", async () => {
    mocks.awesome.mockImplementation(async () => 0);

    const code = await runCli([`--data-dir=${dataDir}`]);

    expect(code).toBe(2);
    const expected = path.join(dataDir, "raw", DATE, "awesome-neovim-additions.json");
    expect(step(await readSummary(), "awesome-neovim")).toMatchObject({
      ok: false,
      exitCode: 0,
      error: `expected output ${expected} not found (UTC date rolled over?)`,
    });
  });

  it("fails a scraper that exits 0 while today's file predates the run", async () => {
    const dir = path.join(dataDir, "raw", DATE);
    const stale = path.join(dir, "awesome-neovim-additions.json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(stale, "{}");
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(stale, anHourAgo, anHourAgo);
    mocks.awesome.mockImplementation(async () => 0);

    const code = await runCli([`--data-dir=${dataDir}`]);

    expect(code).toBe(2);
    expect(step(await readSummary(), "awesome-neovim")).toMatchObject({
      ok: false,
      exitCode: 0,
      error: `expected output ${stale} predates this run (stale same-day file; UTC date rolled over?)`,
    });
  });

  it("exits 1 when enrich fails, and still writes the summary", async () => {
    mocks.enrich.mockImplementation(async () => {
      process.stderr.write("enrich-links: no .json files in x\n");
      return 1;
    });

    const code = await runCli([`--data-dir=${dataDir}`]);

    expect(code).toBe(1);
    const summary = await readSummary();
    expect(summary.ok).toBe(false);
    expect(step(summary, "enrich")).toMatchObject({
      ok: false,
      exitCode: 1,
      error: "enrich-links: no .json files in x",
    });
  });

  it("lists stale same-day raw files in rawFiles", async () => {
    const dir = path.join(dataDir, "raw", DATE);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "reddit-neovim.json"), "{}");
    mocks.reddit.mockImplementation(async () => 1);

    await runCli([`--data-dir=${dataDir}`]);

    expect((await readSummary()).rawFiles).toContain("reddit-neovim.json");
  });

  it("rejects unknown arguments with exit 1 and runs nothing", async () => {
    const code = await runCli(["--date=2026-11-02"]);

    expect(code).toBe(1);
    expect(stderr).toContain("unknown argument --date=2026-11-02");
    expect(calls).toEqual([]);
  });
});
