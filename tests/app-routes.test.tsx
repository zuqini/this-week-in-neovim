import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/issue-body", () => ({
  IssueBody: ({ issue }: { issue: { slug: string } }) => (
    <div data-issue-body={issue.slug}>[issue body stub]</div>
  ),
}));

describe("app/sitemap.ts", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/issues");
    vi.resetModules();
  });

  it("emits home + archive + one entry per issue, with absolute URLs", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const { getAllIssues } = await import("@/lib/issues");
    const issues = getAllIssues();
    const entries = sitemap();

    expect(entries.length).toBe(2 + issues.length);

    const [home, archive, ...rest] = entries;
    expect(home.url).toBe("https://thisweekinneovim.org/");
    expect(home.priority).toBe(1);
    expect(home.changeFrequency).toBe("weekly");

    expect(archive.url).toBe("https://thisweekinneovim.org/issues/");
    expect(archive.priority).toBe(0.8);
    expect(archive.changeFrequency).toBe("weekly");

    for (const r of rest) {
      expect(r.url.startsWith("https://thisweekinneovim.org/issues/")).toBe(
        true,
      );
      expect(r.priority).toBe(0.7);
      expect(r.changeFrequency).toBe("yearly");
    }

    if (issues[0]) {
      const latest = new Date(`${issues[0].date}T00:00:00Z`);
      expect((home.lastModified as Date).toISOString()).toBe(
        latest.toISOString(),
      );
    }
  });

  it("falls back to 2026-05-01 and emits only the static rows when no issues exist", async () => {
    vi.doMock("@/lib/issues", async () => {
      const real = await vi.importActual<typeof import("@/lib/issues")>(
        "@/lib/issues",
      );
      return { ...real, getAllIssues: () => [] };
    });
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = sitemap();
    expect(entries.length).toBe(2);
    expect((entries[0].lastModified as Date).toISOString()).toBe(
      "2026-05-01T00:00:00.000Z",
    );
  });
});

describe("app/robots.ts", () => {
  it("returns a permissive rule and an absolute sitemap URL", async () => {
    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: "/" }],
      sitemap: "https://thisweekinneovim.org/sitemap.xml",
    });
  });
});

describe("app/feed.xml/route.ts", () => {
  it("returns a Response whose body equals buildRssXml(getAllIssues())", async () => {
    const { GET } = await import("@/app/feed.xml/route");
    const { getAllIssues } = await import("@/lib/issues");
    const { buildRssXml } = await import("@/lib/feed");
    const res = GET();
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toBe(buildRssXml(getAllIssues()));
  });

  it("sets Content-Type to application/rss+xml; charset=utf-8", async () => {
    const { GET } = await import("@/app/feed.xml/route");
    const res = GET();
    expect(res.headers.get("Content-Type")).toBe(
      "application/rss+xml; charset=utf-8",
    );
  });
});

describe("app/issues/[slug]/page.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("generateStaticParams returns one {slug} per real issue", async () => {
    const page = await import("@/app/issues/[slug]/page");
    const { getIssueSlugs } = await import("@/lib/issues");
    const params = page.generateStaticParams();
    expect(params).toEqual(getIssueSlugs().map((slug) => ({ slug })));
    for (const p of params) {
      expect(typeof p.slug).toBe("string");
    }
  });

  it("generateMetadata returns {} for unknown slug", async () => {
    const page = await import("@/app/issues/[slug]/page");
    const meta = await page.generateMetadata({
      params: Promise.resolve({ slug: "does-not-exist" }),
    });
    expect(meta).toEqual({});
  });

  it("generateMetadata returns full metadata for the real 2026-05-04 slug", async () => {
    const page = await import("@/app/issues/[slug]/page");
    const meta = await page.generateMetadata({
      params: Promise.resolve({ slug: "2026-05-04" }),
    });
    expect(meta.title).toBeTruthy();
    expect(meta.description).toBeTruthy();
    expect(meta.alternates).toEqual({ canonical: "/issues/2026-05-04/" });
    expect(meta.openGraph).toMatchObject({
      type: "article",
      url: "https://thisweekinneovim.org/issues/2026-05-04/",
      publishedTime: "2026-05-04",
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("IssuePage throws (notFound) for an unknown slug", async () => {
    const { default: IssuePage } = await import("@/app/issues/[slug]/page");
    await expect(
      IssuePage({ params: Promise.resolve({ slug: "does-not-exist" }) }),
    ).rejects.toThrow();
  });

  it("IssuePage renders header bits for the real slug (IssueBody mocked)", async () => {
    const { default: IssuePage } = await import("@/app/issues/[slug]/page");
    const tree = await IssuePage({
      params: Promise.resolve({ slug: "2026-05-04" }),
    });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Issue #1");
    expect(html).toContain('dateTime="2026-05-04"');
    expect(html).toContain("May 4, 2026");
    expect(html).toContain("[issue body stub]");
  });
});

describe("app/issues/page.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/issues");
    vi.resetModules();
  });

  it("renders an <h2> per year and an <li> per issue", async () => {
    const { default: ArchivePage } = await import("@/app/issues/page");
    const { getAllIssues } = await import("@/lib/issues");
    const issues = getAllIssues();
    const html = renderToStaticMarkup(ArchivePage());
    const years = new Set(issues.map((i) => i.date.slice(0, 4)));
    for (const y of years) {
      expect(html).toContain(`id="year-${y}"`);
    }
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(issues.length);
  });

  it("renders the empty-state copy when no issues exist", async () => {
    vi.doMock("@/lib/issues", async () => {
      const real = await vi.importActual<typeof import("@/lib/issues")>(
        "@/lib/issues",
      );
      return { ...real, getAllIssues: () => [] };
    });
    const { default: ArchivePage } = await import("@/app/issues/page");
    const html = renderToStaticMarkup(ArchivePage());
    expect(html).toContain("No issues yet.");
  });
});

describe("app/page.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/issues");
    vi.resetModules();
  });

  it("renders the empty-state copy when no issues exist", async () => {
    vi.doMock("@/lib/issues", async () => {
      const real = await vi.importActual<typeof import("@/lib/issues")>(
        "@/lib/issues",
      );
      return { ...real, getAllIssues: () => [] };
    });
    const { default: HomePage } = await import("@/app/page");
    const tree = await HomePage();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("first issue is on the way");
    expect(html).toContain('href="/feed.xml"');
  });

  it("renders the latest title in an <h1>; omits Earlier section with one issue", async () => {
    vi.doMock("@/lib/issues", async () => {
      const real = await vi.importActual<typeof import("@/lib/issues")>(
        "@/lib/issues",
      );
      const onlyOne: ReturnType<typeof real.getAllIssues> = [
        {
          slug: "2026-05-04",
          issue: 1,
          title: "Sole issue",
          date: "2026-05-04",
          summary: "Just one.",
          draft: false,
          sources: [],
        },
      ];
      return { ...real, getAllIssues: () => onlyOne };
    });
    const { default: HomePage } = await import("@/app/page");
    const tree = await HomePage();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('id="latest-heading"');
    expect(html).toContain("Sole issue");
    expect(html).not.toContain("Earlier issues");
  });

  it("renders the Earlier issues section when there is more than one issue", async () => {
    vi.doMock("@/lib/issues", async () => {
      const real = await vi.importActual<typeof import("@/lib/issues")>(
        "@/lib/issues",
      );
      const many: ReturnType<typeof real.getAllIssues> = [
        {
          slug: "2026-05-11",
          issue: 2,
          title: "Latest",
          date: "2026-05-11",
          summary: "Latest summary.",
          draft: false,
          sources: [],
        },
        {
          slug: "2026-05-04",
          issue: 1,
          title: "Earlier one",
          date: "2026-05-04",
          summary: "Earlier summary.",
          draft: false,
          sources: [],
        },
      ];
      return { ...real, getAllIssues: () => many };
    });
    const { default: HomePage } = await import("@/app/page");
    const tree = await HomePage();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Earlier issues");
    expect(html).toContain("Earlier one");
  });
});

describe("app/not-found.tsx", () => {
  it("renders the E486 line and recovery links", async () => {
    const { default: NotFound } = await import("@/app/not-found");
    const html = renderToStaticMarkup(NotFound());
    expect(html).toContain("E486: Pattern not found");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/issues');
  });
});

describe("app/layout.tsx", () => {
  it("metadata exposes metadataBase, template, RSS alternate", async () => {
    const { metadata } = await import("@/app/layout");
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    const tpl = (metadata.title as { template?: string }).template;
    expect(tpl?.endsWith("— TWiN")).toBe(true);
    const rss = (
      metadata.alternates?.types as
        | Record<string, Array<{ url: string }>>
        | undefined
    )?.["application/rss+xml"];
    expect(rss?.[0]?.url).toBe("/feed.xml");
  });

  it("viewport.themeColor pairs light/dark with PALETTE values", async () => {
    const { viewport } = await import("@/app/layout");
    const { PALETTE } = await import("@/lib/theme");
    const themeColor = viewport.themeColor as Array<{
      media: string;
      color: string;
    }>;
    expect(themeColor).toHaveLength(2);
    expect(themeColor[0].color).toBe(PALETTE.bgLight);
    expect(themeColor[1].color).toBe(PALETTE.bgDark);
  });

  it("RootLayout renders skip link, brand mark, and footer with current year", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    const html = renderToStaticMarkup(<RootLayout>child-content</RootLayout>);
    expect(html).toContain("Skip to content");
    expect(html).toContain(":TWiN");
    expect(html).toContain(`© ${new Date().getFullYear()}`);
    expect(html).toContain("child-content");
  });
});
