import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getAdjacent,
  getIssueBySlug,
  getIssueRouteParams,
  getIssueSlugs,
  loadIssuesFromDir,
  parseIssueMeta,
} from "@/lib/issues";
import { loadIssueBody } from "@/components/issue-body";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const ISSUES_DIR = path.join(FIXTURES, "issues");

function readFixture(name: string): string {
  const sub = name.startsWith("invalid-")
    ? "parser/invalid"
    : name.startsWith("valid-")
      ? "parser/valid"
      : "";
  return fs.readFileSync(path.join(FIXTURES, sub, name), "utf8");
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

  it("throws on date with time/TZ instead of silently drifting the day", () => {
    expect(() =>
      parseIssueMeta(
        readFixture("invalid-date-with-time.mdx"),
        "invalid-date-with-time",
      ),
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
      "2026-03-02-with-sources",
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
      "2026-04-06-date-as-date",
    );
    expect(meta.date).toBe("2026-04-06");
  });

  it("treats YAML 1.1 booleans/sexagesimals as plain strings (YAML 1.2 schema)", () => {
    const meta = parseIssueMeta(
      readFixture("valid-yaml12-strings.mdx"),
      "2026-04-20-yaml12-strings",
    );
    expect(meta.title).toBe("No");
    expect(meta.summary).toBe("1:30:00");
  });

  it("throws when slug's date prefix does not match frontmatter date", () => {
    expect(() =>
      parseIssueMeta(
        readFixture("valid-date-as-date.mdx"),
        "2026-01-01-mismatch",
      ),
    ).toThrow(/Slug\/date mismatch/);
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

  it("throws when filename slug date does not match frontmatter date", () => {
    expect(() =>
      loadIssuesFromDir(path.join(FIXTURES, "issues-mismatch")),
    ).toThrow(/Slug\/date mismatch/);
  });
});

describe("getAdjacent / getIssueBySlug / getIssueSlugs / getIssueRouteParams (pure)", () => {
  const issues = loadIssuesFromDir(ISSUES_DIR);

  it("getIssueSlugs returns slugs in input order", () => {
    expect(getIssueSlugs(issues)).toEqual([
      "2026-01-19-tied",
      "2026-01-19",
      "2026-01-12",
      "2026-01-05",
    ]);
  });

  it("getIssueRouteParams wraps each slug in a {slug} object", () => {
    expect(getIssueRouteParams(issues)).toEqual(
      issues.map((i) => ({ slug: i.slug })),
    );
  });

  it("getIssueBySlug returns the matching issue or null", () => {
    expect(getIssueBySlug(issues, "2026-01-12")?.issue).toBe(2);
    expect(getIssueBySlug(issues, "nope")).toBeNull();
  });

  it("getAdjacent returns older/newer for a middle slug", () => {
    const { older, newer } = getAdjacent(issues, "2026-01-12");
    expect(newer?.slug).toBe("2026-01-19");
    expect(older?.slug).toBe("2026-01-05");
  });

  it("getAdjacent returns null newer for the newest slug", () => {
    expect(getAdjacent(issues, "2026-01-19-tied").newer).toBeNull();
  });

  it("getAdjacent returns null older for the oldest slug", () => {
    expect(getAdjacent(issues, "2026-01-05").older).toBeNull();
  });

  it("getAdjacent returns nulls for an unknown slug", () => {
    expect(getAdjacent(issues, "nope")).toEqual({
      newer: null,
      older: null,
    });
  });
});

describe("getAllIssues + production caching", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { __resetIssuesCacheForTests } = await import("@/lib/issues");
    __resetIssuesCacheForTests();
  });

  it("includes the real production slug", async () => {
    const { getAllIssues } = await import("@/lib/issues");
    expect(getAllIssues().some((i) => i.slug === "2026-05-04")).toBe(true);
  });

  it("returns the same array reference across calls in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getAllIssues, __resetIssuesCacheForTests } = await import(
      "@/lib/issues"
    );
    __resetIssuesCacheForTests();
    expect(getAllIssues()).toBe(getAllIssues());
  });

  it("returns fresh arrays in non-production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { getAllIssues } = await import("@/lib/issues");
    expect(getAllIssues()).not.toBe(getAllIssues());
  });

  it("reset hook clears the production cache", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getAllIssues, __resetIssuesCacheForTests } = await import(
      "@/lib/issues"
    );
    __resetIssuesCacheForTests();
    const first = getAllIssues();
    __resetIssuesCacheForTests();
    expect(getAllIssues()).not.toBe(first);
  });
});

describe("loadIssueBody", () => {
  it("rejects slugs containing path separators", async () => {
    await expect(loadIssueBody("../foo")).rejects.toThrow(/Invalid issue slug/);
  });

  it("rejects slugs containing dots", async () => {
    await expect(loadIssueBody("foo.bar")).rejects.toThrow(/Invalid issue slug/);
  });

  it("rejects empty slugs", async () => {
    await expect(loadIssueBody("")).rejects.toThrow(/Invalid issue slug/);
  });

  it("rejects slugs that don't begin with an ISO date prefix", async () => {
    await expect(loadIssueBody("__proto__")).rejects.toThrow(/Invalid issue slug/);
    await expect(loadIssueBody("not-a-date")).rejects.toThrow(/Invalid issue slug/);
    await expect(loadIssueBody("2026-01-19-Bad_Suffix")).rejects.toThrow(/Invalid issue slug/);
  });
});
