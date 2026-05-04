import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { z } from "zod";

const YAML_ENGINE = {
  parse: (input: string) => yaml.load(input) as object,
  stringify: (input: object) => yaml.dump(input),
};

// `import.meta.dirname` isn't substituted by webpack; use cwd. `next build`
// is always invoked from the project root in this repo (no monorepo).
const CONTENT_DIR = path.join(process.cwd(), "content", "issues");

const SourceSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  fetched_at: z.string().optional(),
  title: z.string().optional(),
});

const FrontmatterSchema = z.object({
  issue: z.number().int().positive(),
  title: z.string().min(1),
  date: z.preprocess((v) => {
    if (v instanceof Date) {
      if (v.getUTCHours() !== 0 || v.getUTCMinutes() !== 0 || v.getUTCSeconds() !== 0 || v.getUTCMilliseconds() !== 0) {
        return undefined;
      }
      return v.toISOString().slice(0, 10);
    }
    return v;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  summary: z.string().min(1),
  draft: z.boolean().optional().default(false),
  sources: z.array(SourceSchema).default([]),
});

export type IssueSource = z.infer<typeof SourceSchema>;
export type IssueFrontmatter = z.infer<typeof FrontmatterSchema>;

export interface IssueMeta extends IssueFrontmatter {
  slug: string;
}

export function parseIssueMeta(raw: string, slug: string): IssueMeta {
  const { data } = matter(raw, { engines: { yaml: YAML_ENGINE } });
  const parsed = FrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid frontmatter in ${slug}.mdx: ${parsed.error.message}`,
    );
  }
  return { ...parsed.data, slug };
}

export function loadIssuesFromDir(dir: string): IssueMeta[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const slug = f.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const meta = parseIssueMeta(raw, slug);
      const slugDate = slug.slice(0, 10);
      if (slugDate !== meta.date) {
        throw new Error(
          `Slug/date mismatch in ${slug}.mdx: filename starts with ${slugDate} but frontmatter date is ${meta.date}`,
        );
      }
      return meta;
    })
    .filter((i) => !i.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || b.issue - a.issue);
}

interface Memoized<T> {
  (): T;
  reset: () => void;
}

function memoize<T>(fn: () => T, opts: { when: () => boolean }): Memoized<T> {
  let cached: T | null = null;
  const memo = (() => {
    if (!opts.when()) return fn();
    if (cached === null) cached = fn();
    return cached;
  }) as Memoized<T>;
  memo.reset = () => {
    cached = null;
  };
  return memo;
}

export const getAllIssues = memoize(() => loadIssuesFromDir(CONTENT_DIR), {
  when: () => process.env.NODE_ENV === "production",
});

export const __resetIssuesCacheForTests = getAllIssues.reset;

export function getIssueSlugs(): string[] {
  return getAllIssues().map((i) => i.slug);
}

export function getIssueBySlug(slug: string): IssueMeta | null {
  return getAllIssues().find((i) => i.slug === slug) ?? null;
}

export function getAdjacent(slug: string): {
  newer: IssueMeta | null;
  older: IssueMeta | null;
} {
  const issues = getAllIssues();
  const idx = issues.findIndex((i) => i.slug === slug);
  if (idx === -1) return { newer: null, older: null };
  return {
    newer: idx > 0 ? issues[idx - 1] : null,
    older: idx < issues.length - 1 ? issues[idx + 1] : null,
  };
}

export async function loadIssueBody(
  slug: string,
): Promise<React.ComponentType> {
  if (!/^\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/.test(slug)) {
    throw new Error(`Invalid issue slug: ${slug}`);
  }
  const mod = await import(`../content/issues/${slug}.mdx`);
  return mod.default;
}
