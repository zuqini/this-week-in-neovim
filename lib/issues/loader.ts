import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parseIssueMeta, type IssueMeta } from "./schema";

export function loadIssuesFromDir(dir: string): IssueMeta[] {
  if (!fs.existsSync(dir)) return [];
  const issues = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const slug = f.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      return parseIssueMeta(raw, slug);
    })
    .filter((i) => !i.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || b.issue - a.issue);

  for (let i = 0; i + 1 < issues.length; i++) {
    if (issues[i].issue <= issues[i + 1].issue) {
      throw new Error(
        `Issue numbers must be strictly decreasing in newest-first order, but ${issues[i].slug} (#${issues[i].issue}) precedes ${issues[i + 1].slug} (#${issues[i + 1].issue}).`,
      );
    }
  }
  return issues;
}
