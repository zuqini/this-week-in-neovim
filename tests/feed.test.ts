import { describe, expect, it } from "vitest";
import { buildRssXml, escapeXml } from "@/lib/feed";
import type { IssueMeta } from "@/lib/issues";

const FIXTURES: IssueMeta[] = [
  {
    slug: "2026-02-02",
    issue: 3,
    title: "Newest issue",
    date: "2026-02-02",
    summary: "Latest summary.",
    draft: false,
    sources: [],
  },
  {
    slug: "2026-01-26",
    issue: 2,
    title: "Middle <issue> & friends",
    date: "2026-01-26",
    summary: "It's middle's summary.",
    draft: false,
    sources: [],
  },
  {
    slug: "2026-01-19",
    issue: 1,
    title: 'Oldest "issue"',
    date: "2026-01-19",
    summary: "Oldest summary.",
    draft: false,
    sources: [],
  },
];

describe("escapeXml", () => {
  it("escapes &<>'\" with numeric entity for apostrophe", () => {
    expect(escapeXml(`a & b < c > d ' e " f`)).toBe(
      "a &amp; b &lt; c &gt; d &#39; e &quot; f",
    );
  });

  it("strips illegal XML 1.0 control characters", () => {
    expect(escapeXml("hello\x00world\x07!")).toBe("helloworld!");
  });

  it("preserves tab/LF/CR", () => {
    expect(escapeXml("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });
});

describe("buildRssXml", () => {
  it("escapes titles with &, <, '", () => {
    const xml = buildRssXml(FIXTURES);
    expect(xml).toContain("Middle &lt;issue&gt; &amp; friends");
    expect(xml).toContain("Oldest &quot;issue&quot;");
  });

  it("emits stable URLs for items", () => {
    const xml = buildRssXml(FIXTURES);
    expect(xml).toContain("/issues/2026-02-02/</link>");
    expect(xml).toContain('isPermaLink="true">');
    expect(xml).toContain("/issues/2026-01-19/</guid>");
  });

  it("uses the latest issue date for lastBuildDate", () => {
    const xml = buildRssXml(FIXTURES);
    expect(xml).toMatch(
      /<lastBuildDate>[A-Z][a-z]{2}, 02 Feb 2026 00:00:00 GMT<\/lastBuildDate>/,
    );
  });

  it("matches snapshot structure (latin-only, no whitespace flake risk)", () => {
    const xml = buildRssXml(FIXTURES);
    expect(xml).toMatchSnapshot();
  });

  it("is byte-identical across calls", () => {
    expect(buildRssXml(FIXTURES)).toBe(buildRssXml(FIXTURES));
  });

  it("falls back to epoch lastBuildDate and emits no items for empty input", () => {
    const xml = buildRssXml([]);
    expect(xml).toContain(
      "<lastBuildDate>Thu, 01 Jan 1970 00:00:00 GMT</lastBuildDate>",
    );
    expect(xml).not.toContain("<item>");
  });

  it("emits exactly one <item> for a single-issue feed", () => {
    const xml = buildRssXml([FIXTURES[0]]);
    const matches = xml.match(/<item>/g) ?? [];
    expect(matches.length).toBe(1);
    expect(xml).toMatchSnapshot();
  });

  it("emits a (possibly empty) <description> even when summary is empty", () => {
    const xml = buildRssXml([{ ...FIXTURES[0], summary: "" }]);
    expect(xml).toContain("<description></description>");
  });
});
