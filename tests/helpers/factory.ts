import type { IssueMeta } from "@/lib/issues";

export function makeIssue(overrides: Partial<IssueMeta> = {}): IssueMeta {
  return {
    slug: "2026-05-04",
    issue: 1,
    title: "First issue",
    date: "2026-05-04",
    summary: "A one-line summary.",
    draft: false,
    sources: [],
    ...overrides,
  };
}
