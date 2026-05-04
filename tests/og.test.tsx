import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("OgIssueCard", () => {
  it("renders the :TWiN brand mark, issue meta, title, and host footer", async () => {
    const { OgIssueCard } = await import("@/lib/og");
    const html = renderToStaticMarkup(
      <OgIssueCard
        title="Some issue title"
        issueNumber={42}
        date="May 4, 2026"
      />,
    );
    expect(html).toContain(":TWiN");
    expect(html).toContain("Issue #42");
    expect(html).toContain("May 4, 2026");
    expect(html).toContain("Some issue title");
    expect(html).toContain("thisweekinneovim.org");
  });

  it("truncates titles longer than 90 chars with an ellipsis", async () => {
    const { truncateOgTitle, OgIssueCard } = await import("@/lib/og");
    const long = "a".repeat(150);
    const truncated = truncateOgTitle(long);
    expect(truncated.length).toBe(90);
    expect(truncated.endsWith("…")).toBe(true);

    const html = renderToStaticMarkup(
      <OgIssueCard title={long} issueNumber={1} date="May 4, 2026" />,
    );
    expect(html).toContain(truncated);
    expect(html).not.toContain(long);
  });

  it("leaves short titles untouched", async () => {
    const { truncateOgTitle } = await import("@/lib/og");
    const short = "short title";
    expect(truncateOgTitle(short)).toBe(short);
  });
});

describe("OgHomeCard", () => {
  it("renders the :TWiN brand mark, host, title, description, and subtitle", async () => {
    const { OgHomeCard } = await import("@/lib/og");
    const html = renderToStaticMarkup(
      <OgHomeCard
        title="Site title"
        description="Site description"
        subtitle="Footer subtitle"
      />,
    );
    expect(html).toContain(":TWiN");
    expect(html).toContain("thisweekinneovim.org");
    expect(html).toContain("Site title");
    expect(html).toContain("Site description");
    expect(html).toContain("Footer subtitle");
  });
});

describe("getOgFonts", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("does not read fonts from disk on module import", async () => {
    const fs = await import("node:fs");
    const spy = vi.spyOn(fs.default, "readFileSync");
    await import("@/lib/og");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns two Inter weights with non-empty font buffers", async () => {
    const { getOgFonts } = await import("@/lib/og");
    const fonts = getOgFonts();
    expect(fonts).toHaveLength(2);
    const weights = fonts.map((f) => f.weight).sort();
    expect(weights).toEqual([400, 700]);
    for (const f of fonts) {
      expect(f.name).toBe("Inter");
      expect(f.style).toBe("normal");
      expect(f.data.length).toBeGreaterThan(0);
    }
  });

  it("memoizes the font buffers across calls", async () => {
    const { getOgFonts } = await import("@/lib/og");
    expect(getOgFonts()).toBe(getOgFonts());
  });
});
