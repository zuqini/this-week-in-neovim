#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  defaultSinceArg,
  ensureRepo,
  scrapeRepo,
} from "../src/sources/awesome-neovim/scrape.js";

interface CliArgs {
  repoUrl: string;
  repoDir: string;
  since: string;
  readme: string;
  outDir: string;
  outName: string;
  noFetch: boolean;
}

const DEFAULT_REPO_URL = "https://github.com/rockerBOO/awesome-neovim.git";
const DEFAULT_REPO_DIR = "pipeline/.cache/awesome-neovim";

function parseArgs(argv: string[]): CliArgs {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) bools.add(a.slice(2));
    else flags.set(a.slice(2, eq), a.slice(eq + 1));
  }

  const repoUrl = flags.get("repo-url") ?? DEFAULT_REPO_URL;
  const repoDir = flags.get("repo-dir") ?? DEFAULT_REPO_DIR;
  const since = parseSince(flags.get("since"));
  const readme = flags.get("readme") ?? "README.md";
  const outDir = flags.get("out-dir") ?? "pipeline/data/raw";
  const outName = flags.get("out-name") ?? "awesome-neovim-additions.json";
  const noFetch = bools.has("no-fetch");

  return { repoUrl, repoDir, since, readme, outDir, outName, noFetch };
}

function parseSince(value: string | undefined): string {
  if (!value) return defaultSinceArg();
  const m = value.match(/^(\d+)d$/);
  if (m) return defaultSinceArg(new Date(), Number(m[1]));
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid --since=${value}; expected ISO date or Nd (e.g. 7d)`);
  }
  return new Date(ms).toISOString();
}

function utcDate(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`scrape-awesome-neovim: ${formatErr(err)}\n`);
    return 1;
  }

  if (!args.noFetch) {
    try {
      await ensureRepo(args.repoUrl, args.repoDir);
    } catch (err) {
      process.stderr.write(
        `scrape-awesome-neovim: cannot prepare repo at ${args.repoDir}: ${formatErr(err)}\n`,
      );
      return 1;
    }
  }

  let result;
  try {
    result = await scrapeRepo({
      repoDir: args.repoDir,
      since: args.since,
      readme: args.readme,
    });
  } catch (err) {
    process.stderr.write(`scrape-awesome-neovim: ${formatErr(err)}\n`);
    return 1;
  }

  const dateDir = path.join(args.outDir, utcDate());
  const outPath = path.join(dateDir, args.outName);
  try {
    mkdirSync(dateDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
  } catch (err) {
    process.stderr.write(
      `scrape-awesome-neovim: cannot write ${outPath}: ${formatErr(err)}\n`,
    );
    return 1;
  }

  process.stdout.write(
    `wrote ${result.items.length} additions (since ${args.since}) → ${outPath}\n`,
  );
  return 0;
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
      process.stderr.write(`scrape-awesome-neovim: fatal: ${formatErr(err)}\n`);
      process.exit(1);
    },
  );
}
