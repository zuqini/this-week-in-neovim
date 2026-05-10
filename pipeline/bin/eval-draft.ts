#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import matter from "gray-matter";
import { parseIssueMeta } from "../../lib/issues/schema.js";
import { evalDraft, type EvalReport } from "../src/eval/index.js";

interface CliArgs {
  mdxPath: string;
  minWords?: number;
  maxWords?: number;
  skipLinks: boolean;
  concurrency?: number;
}

type ParseResult = { ok: true; args: CliArgs } | { ok: false; error: string };

function parseArgs(argv: string[]): ParseResult {
  const args = new Map<string, string>();
  let positional: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-links") {
      args.set("skip-links", "true");
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args.set(key, "true");
      } else {
        args.set(key, next);
        i++;
      }
      continue;
    }
    if (positional === undefined) positional = a;
  }
  if (!positional) {
    return {
      ok: false,
      error:
        "usage: eval-draft <mdx-path> [--min-words N] [--max-words N] [--skip-links] [--concurrency N]",
    };
  }
  const num = (key: string): number | undefined =>
    args.has(key) ? Number(args.get(key)) : undefined;
  return {
    ok: true,
    args: {
      mdxPath: positional,
      minWords: num("min-words"),
      maxWords: num("max-words"),
      skipLinks: args.get("skip-links") === "true",
      concurrency: num("concurrency"),
    },
  };
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`eval-draft: ${parsed.error}\n`);
    return 1;
  }

  const filename = path.basename(parsed.args.mdxPath);
  const slug = filename.replace(/\.mdx$/, "").replace(/\.draft$/, "");

  let raw: string;
  try {
    raw = await readFile(parsed.args.mdxPath, "utf8");
  } catch (err) {
    process.stderr.write(
      `eval-draft: cannot read ${parsed.args.mdxPath}: ${formatErr(err)}\n`,
    );
    return 1;
  }

  let meta;
  try {
    meta = parseIssueMeta(raw, slug);
  } catch (err) {
    process.stderr.write(`eval-draft: ${formatErr(err)}\n`);
    return 1;
  }
  const { content } = matter(raw);

  const report = await evalDraft(meta, content, {
    minWords: parsed.args.minWords,
    maxWords: parsed.args.maxWords,
    skipLinks: parsed.args.skipLinks,
    concurrency: parsed.args.concurrency,
  });

  printReport(report);
  return report.ok ? 0 : 1;
}

function printReport(report: EvalReport): void {
  if (!report.citations.ok) {
    process.stderr.write("citations:\n");
    for (const e of report.citations.errors) {
      process.stderr.write(`  - ${e}\n`);
    }
  }
  const wc = report.wordCount;
  if (!wc.ok) {
    const which = wc.count < wc.min ? "below" : "above";
    process.stderr.write(
      `word count: ${wc.count} ${which} bounds [${wc.min}, ${wc.max}]\n`,
    );
  }
  if (!report.links.ok) {
    process.stderr.write(
      `links: ${report.links.failures.length}/${report.links.total} failed\n`,
    );
    for (const f of report.links.failures) {
      const detail = f.error ?? `status ${f.status ?? "?"}`;
      process.stderr.write(`  - ${f.url}: ${detail}\n`);
    }
  }
  if (report.ok) {
    const linksLine = report.links.skipped
      ? "links: skipped"
      : `links: ${report.links.total} ok`;
    process.stdout.write(
      `eval-draft: ok (citations: ok, words: ${wc.count} in [${wc.min}, ${wc.max}], ${linksLine})\n`,
    );
  }
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
      process.stderr.write(`eval-draft: fatal: ${formatErr(err)}\n`);
      process.exit(1);
    },
  );
}
