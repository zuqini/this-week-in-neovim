import "server-only";
import path from "node:path";
import { memoize } from "../memo";
import { loadIssuesFromDir } from "./loader";
import type { IssueMeta } from "./schema";

const CONTENT_DIR = path.join(process.cwd(), "content", "issues");

export const getAllIssues = memoize(() => loadIssuesFromDir(CONTENT_DIR), {
  when: () => process.env.NODE_ENV === "production",
});

export const __resetIssuesCacheForTests = getAllIssues.reset;

export function getIssueSlugs(): string[] {
  return getAllIssues().map((i) => i.slug);
}

export function getIssueRouteParams(): Array<{ slug: string }> {
  return getIssueSlugs().map((slug) => ({ slug }));
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

export type { IssueMeta };
export { parseIssueMeta } from "./schema";
export { loadIssuesFromDir } from "./loader";
