import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

export { formatIssueDate, issueDate } from "./date";

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
  date: z.preprocess(
    (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ),
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
  const { data } = matter(raw);
  const parsed = FrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid frontmatter in ${slug}.mdx: ${parsed.error.message}`,
    );
  }
  if (parsed.data.title.length > 90) {
    console.warn(
      `Issue ${slug}: title is ${parsed.data.title.length} chars; OG card clamps to 3 lines.`,
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
      return parseIssueMeta(raw, slug);
    })
    .filter((i) => !i.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || b.issue - a.issue);
}

let _all: IssueMeta[] | null = null;

export function getAllIssues(): IssueMeta[] {
  if (process.env.NODE_ENV !== "production") return loadIssuesFromDir(CONTENT_DIR);
  if (_all === null) _all = loadIssuesFromDir(CONTENT_DIR);
  return _all;
}

export function getIssueSlugs(): string[] {
  return getAllIssues().map((i) => i.slug);
}

export function getIssueBySlug(slug: string): IssueMeta | null {
  return getAllIssues().find((i) => i.slug === slug) ?? null;
}

export function findAdjacent(
  issues: IssueMeta[],
  slug: string,
): { older: IssueMeta | null; newer: IssueMeta | null } {
  const idx = issues.findIndex((i) => i.slug === slug);
  if (idx === -1) return { older: null, newer: null };
  return {
    newer: idx > 0 ? issues[idx - 1] : null,
    older: idx < issues.length - 1 ? issues[idx + 1] : null,
  };
}

export function getAdjacent(slug: string): {
  older: IssueMeta | null;
  newer: IssueMeta | null;
} {
  return findAdjacent(getAllIssues(), slug);
}

export async function loadIssueBody(
  slug: string,
): Promise<React.ComponentType> {
  const mod = await import(`../content/issues/${slug}.mdx`);
  return mod.default;
}
