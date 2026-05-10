import {
  validateCitations,
  type CitationResult,
} from "../../../lib/citations.js";
import type { IssueMeta } from "../../../lib/issues/schema.js";
import { checkUrls, type UrlCheckResult } from "./links.js";

export interface WordCountReport {
  ok: boolean;
  count: number;
  min: number;
  max: number;
}

export interface LinksReport {
  ok: boolean;
  total: number;
  failures: UrlCheckResult[];
  skipped: boolean;
}

export interface EvalReport {
  ok: boolean;
  citations: CitationResult;
  links: LinksReport;
  wordCount: WordCountReport;
}

export interface EvalDraftOpts {
  fetch?: typeof fetch;
  userAgent?: string;
  concurrency?: number;
  minWords?: number;
  maxWords?: number;
  skipLinks?: boolean;
  retryAfterCapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MIN_WORDS = 100;
const DEFAULT_MAX_WORDS = 10_000;

export async function evalDraft(
  meta: Pick<IssueMeta, "sources">,
  body: string,
  opts: EvalDraftOpts = {},
): Promise<EvalReport> {
  const citations = validateCitations(meta, body);

  const min = opts.minWords ?? DEFAULT_MIN_WORDS;
  const max = opts.maxWords ?? DEFAULT_MAX_WORDS;
  const count = countWords(body);
  const wordCount: WordCountReport = {
    ok: count >= min && count <= max,
    count,
    min,
    max,
  };

  let links: LinksReport;
  if (opts.skipLinks) {
    links = { ok: true, total: 0, failures: [], skipped: true };
  } else {
    const results = await checkUrls(meta.sources.map((s) => s.url), {
      fetch: opts.fetch,
      userAgent: opts.userAgent,
      concurrency: opts.concurrency,
      retryAfterCapMs: opts.retryAfterCapMs,
      sleep: opts.sleep,
    });
    const failures = results.filter((r) => !r.ok);
    links = {
      ok: failures.length === 0,
      total: results.length,
      failures,
      skipped: false,
    };
  }

  return {
    ok: citations.ok && links.ok && wordCount.ok,
    citations,
    links,
    wordCount,
  };
}

const FENCED_RE = /(^|\n)(```|~~~)[\s\S]*?\n\2(?=\n|$)/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:[^\n]*$/gm;

export function countWords(body: string): number {
  const stripped = body
    .replace(FENCED_RE, "")
    .replace(INLINE_CODE_RE, "")
    .replace(FOOTNOTE_DEF_RE, "");
  const tokens = stripped.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}
