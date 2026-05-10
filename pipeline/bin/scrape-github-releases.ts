#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  defaultSinceIso,
  scrapeReleases,
} from "../src/sources/github/releases.js";

interface CliArgs {
  owner: string;
  repo: string;
  since: string;
  outDir: string;
  outName: string;
  perPage: number;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) {
      flags.set(a.slice(2), "true");
    } else {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
    }
  }

  const owner = flags.get("owner") ?? "neovim";
  const repo = flags.get("repo") ?? "neovim";
  const sinceFlag = flags.get("since");
  const since = parseSince(sinceFlag);
  const outDir = flags.get("out-dir") ?? "pipeline/data/raw";
  const outName = flags.get("out-name") ?? `github-${owner}-${repo}-releases.json`;
  const perPageRaw = flags.get("per-page") ?? "30";
  const perPage = Number(perPageRaw);
  if (!Number.isInteger(perPage) || perPage <= 0 || perPage > 100) {
    throw new Error(`invalid --per-page=${perPageRaw}; must be 1..100`);
  }

  return { owner, repo, since, outDir, outName, perPage };
}

function parseSince(value: string | undefined): string {
  if (!value) return defaultSinceIso();
  const m = value.match(/^(\d+)d$/);
  if (m) return defaultSinceIso(new Date(), Number(m[1]));
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
    process.stderr.write(`scrape-github-releases: ${formatErr(err)}\n`);
    return 1;
  }

  const token = process.env.GITHUB_TOKEN;
  let result;
  try {
    result = await scrapeReleases(
      { owner: args.owner, repo: args.repo, since: args.since, perPage: args.perPage },
      { token },
    );
  } catch (err) {
    process.stderr.write(`scrape-github-releases: ${formatErr(err)}\n`);
    return 1;
  }

  const dateDir = path.join(args.outDir, utcDate());
  const outPath = path.join(dateDir, args.outName);
  try {
    mkdirSync(dateDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
  } catch (err) {
    process.stderr.write(
      `scrape-github-releases: cannot write ${outPath}: ${formatErr(err)}\n`,
    );
    return 1;
  }

  process.stdout.write(
    `wrote ${result.items.length} releases (since ${args.since}) → ${outPath}\n`,
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
      process.stderr.write(`scrape-github-releases: fatal: ${formatErr(err)}\n`);
      process.exit(1);
    },
  );
}
