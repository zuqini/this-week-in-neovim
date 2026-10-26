#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { CaptureError, captureOutput } from "../src/capture.js";
import { runCli as scrapeGithubReleases } from "./scrape-github-releases.js";
import { runCli as scrapeAwesomeNeovim } from "./scrape-awesome-neovim.js";
import { runCli as scrapeReddit } from "./scrape-reddit.js";
import { runCli as enrichLinks } from "./enrich-links.js";

interface CliArgs {
  dataDir: string;
}

interface StepResult {
  name: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
  summary: string | null;
  error?: string;
}

interface Scraper {
  name: string;
  run: (argv: string[]) => Promise<number>;
  argv: (rawRoot: string, outName: string) => string[];
  outName: string;
}

const SUBREDDIT = "neovim";

const SCRAPERS: Scraper[] = [
  {
    name: "github-releases",
    run: scrapeGithubReleases,
    argv: (rawRoot, outName) => [`--out-dir=${rawRoot}`, `--out-name=${outName}`],
    outName: "github-neovim-neovim-releases.json",
  },
  {
    name: "awesome-neovim",
    run: scrapeAwesomeNeovim,
    argv: (rawRoot, outName) => [`--out-dir=${rawRoot}`, `--out-name=${outName}`],
    outName: "awesome-neovim-additions.json",
  },
  {
    name: "reddit",
    run: scrapeReddit,
    argv: (rawRoot) => [`--subreddit=${SUBREDDIT}`, "--limit=25", "--cdp-url", `--out-dir=${rawRoot}`],
    outName: `reddit-${SUBREDDIT}.json`,
  },
];

const MAX_ERROR_LINES = 20;

function parseArgs(argv: string[]): CliArgs {
  let dataDir = "pipeline/data";
  for (const a of argv) {
    if (a === "--") continue;
    if (a.startsWith("--data-dir=") && a.length > "--data-dir=".length) {
      dataDir = a.slice("--data-dir=".length);
    } else {
      throw new Error(`unknown argument ${a}; usage: pipeline:week [--data-dir=<dir>]`);
    }
  }
  return { dataDir };
}

function utcDate(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
}

async function runStep(
  name: string,
  fn: () => Promise<number>,
  expected?: string,
): Promise<StepResult> {
  const started = Date.now();
  let exitCode: number;
  let stdout = "";
  let stderr = "";
  let thrown: string | undefined;
  try {
    const captured = await captureOutput(fn);
    exitCode = captured.value;
    stdout = captured.stdout;
    stderr = captured.stderr;
  } catch (err) {
    exitCode = 1;
    thrown = formatErr(err);
    if (err instanceof CaptureError) {
      stdout = err.stdout;
      stderr = err.stderr;
    }
  }
  const durationMs = Date.now() - started;
  const summary = nonEmptyLines(stdout).at(-1) ?? null;
  const result: StepResult = { name, ok: false, exitCode, durationMs, summary };

  if (thrown !== undefined) {
    const lines = [...nonEmptyLines(stderr), `threw: ${thrown}`];
    result.error = lines.slice(-MAX_ERROR_LINES).join("\n");
  } else if (exitCode !== 0) {
    const tail = nonEmptyLines(stderr).slice(-MAX_ERROR_LINES).join("\n");
    result.error = tail || `exited ${exitCode}`;
  } else {
    const problem = expected === undefined ? undefined : checkFresh(expected, started);
    if (problem === undefined) result.ok = true;
    else result.error = problem;
  }
  return result;
}

function checkFresh(file: string, started: number): string | undefined {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return `expected output ${file} not found (UTC date rolled over?)`;
  }
  // Floor to whole seconds: some filesystems store mtime at 1 s resolution.
  if (mtimeMs < Math.floor(started / 1000) * 1000) {
    return `expected output ${file} predates this run (stale same-day file; UTC date rolled over?)`;
  }
  return undefined;
}

function listRawFiles(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`pipeline:week: ${formatErr(err)}\n`);
    return 1;
  }

  const startedAt = new Date();
  const date = utcDate(startedAt);
  const rawRoot = path.join(args.dataDir, "raw");
  const rawDateDir = path.join(rawRoot, date);

  const steps: StepResult[] = [];
  for (const scraper of SCRAPERS) {
    steps.push(
      await runStep(
        scraper.name,
        () => scraper.run(scraper.argv(rawRoot, scraper.outName)),
        path.join(rawDateDir, scraper.outName),
      ),
    );
  }
  const enrich = await runStep("enrich", () =>
    enrichLinks(["--date", date, "--root", args.dataDir]),
  );
  steps.push(enrich);

  const ok = steps.every((s) => s.ok);
  const summaryPath = path.join(args.dataDir, "runs", `${date}.json`);
  const summary = {
    date,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    ok,
    steps,
    rawFiles: listRawFiles(rawDateDir),
  };
  try {
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  } catch (err) {
    process.stderr.write(`pipeline:week: cannot write ${summaryPath}: ${formatErr(err)}\n`);
    return 1;
  }

  const passed = steps.filter((s) => s.ok).map((s) => s.name);
  const failed = steps.filter((s) => !s.ok).map((s) => s.name);
  const parts = [
    ...(passed.length > 0 ? [`ok ${passed.join(", ")}`] : []),
    ...(failed.length > 0 ? [`FAILED ${failed.join(", ")}`] : []),
  ];
  process.stdout.write(`pipeline:week ${date}: ${parts.join("; ")} → ${summaryPath}\n`);

  if (!enrich.ok) return 1;
  return ok ? 0 : 2;
}

function formatErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const isMain = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    const url = new URL(import.meta.url);
    return url.pathname === arg || url.pathname.endsWith(arg);
  } catch {
    return false;
  }
})();

if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`pipeline:week: fatal: ${formatErr(err)}\n`);
      process.exit(1);
    },
  );
}
