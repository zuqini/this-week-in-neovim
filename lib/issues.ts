import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

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
  date: z
    .union([z.string(), z.date()])
    .transform((v) =>
      (v instanceof Date ? v : new Date(v)).toISOString().slice(0, 10),
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

function readIssueMeta(slug: string): IssueMeta {
  const file = path.join(CONTENT_DIR, `${slug}.mdx`);
  const raw = fs.readFileSync(file, "utf8");
  const { data } = matter(raw);
  const parsed = FrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid frontmatter in ${slug}.mdx: ${parsed.error.message}`,
    );
  }
  return { ...parsed.data, slug };
}

export function getIssueSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx") && !f.endsWith(".draft.mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getAllIssues(): IssueMeta[] {
  return getIssueSlugs()
    .map(readIssueMeta)
    .filter((i) => !i.draft)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getIssueBySlug(slug: string): IssueMeta | null {
  try {
    const meta = readIssueMeta(slug);
    return meta.draft ? null : meta;
  } catch {
    return null;
  }
}

export function formatIssueDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
