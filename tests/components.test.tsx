// loadIssueBody (and therefore <IssueBody>) is intentionally not exercised
// here: it requires Next's webpack MDX loader chain. The build itself is the
// integration test for that path.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IssueRow } from "@/components/issue-card";
import type { IssueMeta } from "@/lib/issues";

const ISSUE: IssueMeta = {
  slug: "2026-05-04",
  issue: 1,
  title: "First issue",
  date: "2026-05-04",
  summary: "A one-line summary.",
  draft: false,
  sources: [],
};

describe("IssueRow", () => {
  it("renders issue number, formatted date, link to issueHref, and summary", () => {
    const html = renderToStaticMarkup(<IssueRow issue={ISSUE} />);
    expect(html).toContain("#1");
    expect(html).toContain('<time dateTime="2026-05-04"');
    expect(html).toContain("May 4, 2026");
    expect(html).toContain('href="/issues/2026-05-04');
    expect(html).toContain("First issue");
    expect(html).toContain("A one-line summary.");
  });

  it("omits the summary <p> when summary is empty", () => {
    const html = renderToStaticMarkup(
      <IssueRow issue={{ ...ISSUE, summary: "" }} />,
    );
    expect(html).not.toContain("text-fg/85");
    expect(html).not.toContain("<p");
  });
});
