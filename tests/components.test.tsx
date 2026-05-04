// loadIssueBody (and therefore <IssueBody>) is intentionally not exercised
// here: it requires Next's webpack MDX loader chain. The build itself is the
// integration test for that path.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IssueRow } from "@/components/issue-row";
import { makeIssue } from "./helpers/factory";

const ISSUE = makeIssue();

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
    expect(html).not.toMatch(/<p[\s>]/);
    expect(html).not.toContain("text-fg/85");
  });
});
