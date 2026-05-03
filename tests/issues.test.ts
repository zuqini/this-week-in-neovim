import { describe, expect, it } from "vitest";
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

  it("throws on negative issue number", () => {
    expect(() =>
      parseIssueMeta(readFixture("invalid-negative.mdx"), "invalid-negative"),
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

describe("page params == OG params", () => {
  it("issue page and OG image enumerate the same slugs", async () => {
    const page = await import("@/app/issues/[slug]/page");
    const og = await import("@/app/issues/[slug]/opengraph-image");
    expect(page.generateStaticParams()).toEqual(og.generateStaticParams());
  });
});
