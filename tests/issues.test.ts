import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  findAdjacent,
  loadIssuesFromDir,
  parseIssueMeta,
} from "@/lib/issues";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const ISSUES_DIR = path.join(FIXTURES, "issues");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

describe("parseIssueMeta", () => {
  it("parses valid frontmatter", () => {
    const raw = fs.readFileSync(
      path.join(ISSUES_DIR, "2026-01-05.mdx"),
      "utf8",
    );
    const meta = parseIssueMeta(raw, "2026-01-05");
    expect(meta).toMatchObject({
      slug: "2026-01-05",
      issue: 1,
      title: "First & smallest",
      date: "2026-01-05",
      summary: "First issue summary.",
      draft: false,
    });
  });

  it("defaults draft and sources when omitted", () => {
    const raw = fs.readFileSync(
      path.join(ISSUES_DIR, "2026-01-05.mdx"),
      "utf8",
    );
    const meta = parseIssueMeta(raw, "2026-01-05");
    expect(meta.draft).toBe(false);
    expect(meta.sources).toEqual([]);
  });

  it("throws on negative issue number", () => {
    expect(() =>
      parseIssueMeta(readFixture("invalid-negative.mdx"), "invalid-negative"),
    ).toThrow(/Invalid frontmatter/);
  });

  it("throws on zero issue number", () => {
    expect(() =>
      parseIssueMeta(
        readFixture("invalid-zero-issue.mdx"),
        "invalid-zero-issue",
      ),
    ).toThrow(/Invalid frontmatter/);
  });

  it("throws on non-integer issue number", () => {
    expect(() =>
      parseIssueMeta(
        readFixture("invalid-non-integer-issue.mdx"),
        "invalid-non-integer-issue",
      ),
    ).toThrow(/Invalid frontmatter/);
  });

  it("throws on missing title", () => {
    expect(() =>
      parseIssueMeta(readFixture("invalid-no-title.mdx"), "invalid-no-title"),
    ).toThrow(/Invalid frontmatter/);
  });

  it("throws on malformed date", () => {
    expect(() =>
      parseIssueMeta(readFixture("invalid-bad-date.mdx"), "invalid-bad-date"),
    ).toThrow(/Invalid frontmatter/);
  });

  it("throws when a source url is not a URL", () => {
    expect(() =>
      parseIssueMeta(
        readFixture("invalid-source-url.mdx"),
        "invalid-source-url",
      ),
    ).toThrow(/Invalid frontmatter/);
  });

  it("throws when a source id is empty", () => {
    expect(() =>
      parseIssueMeta(
        readFixture("invalid-source-empty-id.mdx"),
        "invalid-source-empty-id",
      ),
    ).toThrow(/Invalid frontmatter/);
  });

  it("accepts a valid sources array", () => {
    const meta = parseIssueMeta(
      readFixture("valid-with-sources.mdx"),
      "valid-with-sources",
    );
    expect(meta.sources).toEqual([
      {
        id: "s1",
        url: "https://example.com",
        fetched_at: "2026-03-01",
        title: "Example",
      },
      { id: "s2", url: "https://example.org/path" },
    ]);
  });

  it("normalizes a Date-typed date frontmatter to ISO yyyy-mm-dd", () => {
    const meta = parseIssueMeta(
      readFixture("valid-date-as-date.mdx"),
      "valid-date-as-date",
    );
    expect(meta.date).toBe("2026-04-06");
  });

  it("warns when title length exceeds 90 chars", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      parseIssueMeta(readFixture("valid-long-title.mdx"), "valid-long-title");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(
        /Issue valid-long-title: title is \d+ chars/,
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe("loadIssuesFromDir", () => {
  it("excludes drafts", () => {
    const issues = loadIssuesFromDir(ISSUES_DIR);
    expect(issues.find((i) => i.draft)).toBeUndefined();
    expect(issues.find((i) => i.slug === "2099-12-31")).toBeUndefined();
  });

  it("sorts by date desc, then issue desc (tie-stable)", () => {
    const issues = loadIssuesFromDir(ISSUES_DIR);
    const slugs = issues.map((i) => i.slug);
    expect(slugs).toEqual([
      "2026-01-19-tied",
      "2026-01-19",
      "2026-01-12",
      "2026-01-05",
    ]);
  });

  it("returns [] when dir does not exist", () => {
    expect(loadIssuesFromDir(path.join(FIXTURES, "missing"))).toEqual([]);
  });
});

describe("findAdjacent", () => {
  const issues = loadIssuesFromDir(ISSUES_DIR);

  it("returns older/newer for a middle slug", () => {
    const { older, newer } = findAdjacent(issues, "2026-01-12");
    expect(newer?.slug).toBe("2026-01-19");
    expect(older?.slug).toBe("2026-01-05");
  });

  it("returns null for newest's newer", () => {
    const { newer } = findAdjacent(issues, "2026-01-19-tied");
    expect(newer).toBeNull();
  });

  it("returns null for oldest's older", () => {
    const { older } = findAdjacent(issues, "2026-01-05");
    expect(older).toBeNull();
  });

  it("returns nulls for unknown slug", () => {
    expect(findAdjacent(issues, "nope")).toEqual({
      older: null,
      newer: null,
    });
  });
});

describe("getAllIssues + production caching", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("includes the real production slug", async () => {
    const mod = await import("@/lib/issues");
    expect(mod.getAllIssues().some((i) => i.slug === "2026-05-04")).toBe(true);
  });

  it("returns the same array reference across calls in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("@/lib/issues");
    expect(mod.getAllIssues()).toBe(mod.getAllIssues());
  });

  it("returns fresh arrays in non-production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const mod = await import("@/lib/issues");
    expect(mod.getAllIssues()).not.toBe(mod.getAllIssues());
  });
});

describe("getIssueSlugs / getIssueBySlug / getAdjacent", () => {
  it("getIssueSlugs preserves getAllIssues order", async () => {
    const { getAllIssues, getIssueSlugs } = await import("@/lib/issues");
    expect(getIssueSlugs()).toEqual(getAllIssues().map((i) => i.slug));
  });

  it("getIssueBySlug returns the meta for a known slug, null otherwise", async () => {
    const { getIssueBySlug } = await import("@/lib/issues");
    expect(getIssueBySlug("2026-05-04")?.slug).toBe("2026-05-04");
    expect(getIssueBySlug("not-a-real-slug")).toBeNull();
  });

  it("getAdjacent agrees with findAdjacent against getAllIssues()", async () => {
    const { getAllIssues, getAdjacent } = await import("@/lib/issues");
    const all = getAllIssues();
    const target = all[0]?.slug;
    if (!target) return;
    expect(getAdjacent(target)).toEqual(findAdjacent(all, target));
  });
});

describe("page params == OG params", () => {
  it("issue page and OG image enumerate the same slugs", async () => {
    const page = await import("@/app/issues/[slug]/page");
    const og = await import("@/app/issues/[slug]/opengraph-image");
    expect(page.generateStaticParams()).toEqual(og.generateStaticParams());
  });
});
