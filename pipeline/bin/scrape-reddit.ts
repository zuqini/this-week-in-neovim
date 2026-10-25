#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { scrapeReddit, type ScrapeOptions } from "../src/sources/reddit/scrape.js";
import {
  defaultClient,
  RedditHttpError,
  type Timeframe,
} from "../src/sources/reddit/client.js";
import {
  DEFAULT_CDP_URL,
  openBrowserFetch,
  type BrowserFetchSession,
} from "../src/sources/reddit/browser.js";

interface CliArgs {
  subreddit: string;
  timeframe: Timeframe;
  limit: number;
  outDir: string;
  withComments: boolean;
  cdpUrl?: string;
}

const TIMEFRAMES: readonly Timeframe[] = ["day", "week", "month"] as const;

function parseArgs(argv: string[]): CliArgs {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) {
      bools.add(a.slice(2));
    } else {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
    }
  }

  const subreddit = flags.get("subreddit") ?? "neovim";
  const timeframeRaw = flags.get("timeframe") ?? "week";
  if (!TIMEFRAMES.includes(timeframeRaw as Timeframe)) {
    throw new Error(
      `invalid --timeframe=${timeframeRaw}; must be one of ${TIMEFRAMES.join("/")}`,
    );
  }
  const limitRaw = flags.get("limit") ?? "50";
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`invalid --limit=${limitRaw}; must be a positive integer`);
  }
  const outDir = flags.get("out-dir") ?? "pipeline/data/raw";
  const withComments = !bools.has("no-comments");
  const cdpUrl = bools.has("cdp-url") ? DEFAULT_CDP_URL : flags.get("cdp-url");

  return {
    subreddit,
    timeframe: timeframeRaw as Timeframe,
    limit,
    outDir,
    withComments,
    cdpUrl,
  };
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
    process.stderr.write(`scrape-reddit: ${formatErr(err)}\n`);
    return 1;
  }

  const options: ScrapeOptions = {
    subreddit: args.subreddit,
    timeframe: args.timeframe,
    limit: args.limit,
    withComments: args.withComments,
  };

  let result;
  let session: BrowserFetchSession | undefined;
  try {
    if (args.cdpUrl) session = await openBrowserFetch(args.cdpUrl);
    result = await scrapeReddit(options, defaultClient({ fetch: session?.fetch }));
  } catch (err) {
    process.stderr.write(`scrape-reddit: ${formatErr(err)}\n`);
    if (err instanceof RedditHttpError && err.status === 403) {
      process.stderr.write(`scrape-reddit: hint: ${forbiddenHint(args.cdpUrl)}\n`);
    }
    return 1;
  } finally {
    await session?.close();
  }

  const dateDir = path.join(args.outDir, utcDate());
  const outPath = path.join(dateDir, `reddit-${args.subreddit}.json`);
  try {
    mkdirSync(dateDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
  } catch (err) {
    process.stderr.write(`scrape-reddit: cannot write ${outPath}: ${formatErr(err)}\n`);
    return 1;
  }

  process.stdout.write(`wrote ${result.items.length} posts → ${outPath}\n`);
  return 0;
}

function forbiddenHint(cdpUrl: string | undefined): string {
  return cdpUrl
    ? `is the Chrome profile at ${cdpUrl} signed into Reddit? Open its window and sign in.`
    : "Reddit blocks logged-out .json access; re-run with --cdp-url against a signed-in Chrome (`pnpm pipeline:chrome`).";
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
      process.stderr.write(`scrape-reddit: fatal: ${formatErr(err)}\n`);
      process.exit(1);
    },
  );
}
