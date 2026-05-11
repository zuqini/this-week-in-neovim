#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import matter from "gray-matter";
import type { IssueMeta } from "../../lib/issues/schema.js";
import { parseIssueMeta } from "../../lib/issues/schema.js";
import { evalDraft, type EvalReport } from "../src/eval/index.js";
import {
  createAnthropicClient,
  evaluateFaithfulness,
  type FaithfulnessReport,
  type SourceText,
} from "../src/eval/faithfulness.js";

interface CliArgs {
  mdxPath: string;
  minWords?: number;
  maxWords?: number;
  skipLinks: boolean;
  concurrency?: number;
  faithfulness: boolean;
  enrichedDir?: string;
  faithfulnessModel?: string;
}

type ParseResult = { ok: true; args: CliArgs } | { ok: false; error: string };

function parseArgs(argv: string[]): ParseResult {
  const args = new Map<string, string>();
  let positional: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-links" || a === "--faithfulness") {
      args.set(a.slice(2), "true");
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
        "usage: eval-draft <mdx-path> [--min-words N] [--max-words N] [--skip-links] [--concurrency N] [--faithfulness --enriched-dir <path> [--faithfulness-model <id>]]",
    };
  }
  const num = (key: string): number | undefined =>
    args.has(key) ? Number(args.get(key)) : undefined;
  const faithfulness = args.get("faithfulness") === "true";
  const enrichedDir = args.get("enriched-dir");
  if (faithfulness && !enrichedDir) {
    return {
      ok: false,
      error: "--faithfulness requires --enriched-dir <path>",
    };
  }
  return {
    ok: true,
    args: {
      mdxPath: positional,
      minWords: num("min-words"),
      maxWords: num("max-words"),
      skipLinks: args.get("skip-links") === "true",
      concurrency: num("concurrency"),
      faithfulness,
      enrichedDir,
      faithfulnessModel: args.get("faithfulness-model"),
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

  let meta: IssueMeta;
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

  let faithfulness: FaithfulnessReport | null = null;
  if (parsed.args.faithfulness) {
    let sources: Map<string, SourceText>;
    try {
      sources = await loadSourceContent(parsed.args.enrichedDir!, meta);
    } catch (err) {
      process.stderr.write(`eval-draft: ${formatErr(err)}\n`);
      return 1;
    }
    try {
      faithfulness = await evaluateFaithfulness(content, sources, {
        client: createAnthropicClient(),
        model: parsed.args.faithfulnessModel,
      });
    } catch (err) {
      process.stderr.write(`eval-draft: faithfulness: ${formatErr(err)}\n`);
      return 1;
    }
  }

  printReport(report, faithfulness);
  const ok = report.ok && (faithfulness === null || faithfulness.ok);
  return ok ? 0 : 1;
}

/**
 * Maps each `sources[i].id` to source text for the faithfulness judge.
 *
 * Contract (mirrored by `pipeline/prompts/draft.md`):
 *  - Top-level `item.url` is keyed when `linkedContent.content` is a non-empty
 *    string (kinds `github-readme`, `html-article`).
 *  - github-release items (`linkedContent.kind === "github-release"`) are keyed
 *    by `item.url` with `item.body` as the source text, when `body` is a
 *    non-empty string. Release notes live in `item.body`, not `linkedContent`.
 *  - Reddit self-posts (`is_self === true`) are keyed by `item.permalink` with
 *    `item.selftext` as the source text, when both are non-empty strings.
 *    `permalink === item.url` for self-posts, so either citation form lands
 *    on the same key. Embedded `preview.redd.it` image markdown rides along
 *    as noise; the judge tolerates it.
 *  - Each `linkedContentExtras[i].url` is keyed when that extra's `content` is
 *    a non-empty string (same kinds; the README/article behind a Reddit
 *    self-post is the canonical case).
 *  - `top_comments` and `linkedContent.note` are not indexed.
 *
 * Lookup is exact string equality. Changing the keying makes the drafter
 * prompt silently wrong — update both.
 */
export async function loadSourceContent(
  enrichedDir: string,
  meta: IssueMeta,
): Promise<Map<string, SourceText>> {
  let entries: string[];
  try {
    entries = await readdir(enrichedDir);
  } catch (err) {
    throw new Error(`cannot read enriched dir ${enrichedDir}: ${formatErr(err)}`);
  }
  const urlToText = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await readFile(path.join(enrichedDir, entry), "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : [];
    for (const raw of items) {
      const item = raw as {
        url?: unknown;
        body?: unknown;
        is_self?: unknown;
        permalink?: unknown;
        selftext?: unknown;
        linkedContent?: unknown;
        linkedContentExtras?: unknown;
      };
      if (typeof item.url === "string") {
        const lc = item.linkedContent as
          | { kind?: unknown; content?: unknown }
          | null
          | undefined;
        if (lc && typeof lc.content === "string" && lc.content !== "") {
          urlToText.set(item.url, lc.content);
        }
        if (
          lc &&
          lc.kind === "github-release" &&
          typeof item.body === "string" &&
          item.body !== ""
        ) {
          urlToText.set(item.url, item.body);
        }
      }
      if (
        item.is_self === true &&
        typeof item.permalink === "string" &&
        typeof item.selftext === "string" &&
        item.selftext !== ""
      ) {
        urlToText.set(item.permalink, item.selftext);
      }
      const extras = item.linkedContentExtras;
      if (Array.isArray(extras)) {
        for (const rawExtra of extras) {
          const extra = rawExtra as { url?: unknown; content?: unknown };
          if (
            typeof extra.url === "string" &&
            typeof extra.content === "string" &&
            extra.content !== ""
          ) {
            urlToText.set(extra.url, extra.content);
          }
        }
      }
    }
  }
  const result = new Map<string, SourceText>();
  for (const source of meta.sources) {
    const text = urlToText.get(source.url);
    if (text !== undefined) {
      result.set(source.id, { id: source.id, url: source.url, text });
    }
  }
  return result;
}

function printReport(
  report: EvalReport,
  faithfulness: FaithfulnessReport | null,
): void {
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
  if (faithfulness && !faithfulness.ok) {
    const bad = faithfulness.bullets.filter((b) => !b.faithful);
    process.stderr.write(`faithfulness: ${bad.length}/${faithfulness.bullets.length} unfaithful\n`);
    for (const b of bad) {
      process.stderr.write(`  - [^${b.citation}] ${truncate(b.text, 80)}: ${b.reason}\n`);
    }
  }
  if (faithfulness) {
    const u = faithfulness.usage;
    process.stderr.write(
      `faithfulness usage: input=${u.input}, output=${u.output}, cache_read=${u.cacheRead}, cache_creation=${u.cacheCreation}\n`,
    );
  }

  const ok = report.ok && (faithfulness === null || faithfulness.ok);
  if (ok) {
    const linksLine = report.links.skipped
      ? "links: skipped"
      : `links: ${report.links.total} ok`;
    const fLine = faithfulness
      ? `, faithfulness: ${faithfulness.bullets.length} ok`
      : "";
    process.stdout.write(
      `eval-draft: ok (citations: ok, words: ${wc.count} in [${wc.min}, ${wc.max}], ${linksLine}${fLine})\n`,
    );
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
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
