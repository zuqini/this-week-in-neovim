import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { formatIssueDate, issueDate } from "@/lib/date";

const LIB = path.join(import.meta.dirname, "..", "lib", "date.ts");

function formatInChildWithTz(tz: string, iso: string): string {
  const out = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--input-type=module",
      "-e",
      `import { formatIssueDate } from ${JSON.stringify(LIB)}; process.stdout.write(formatIssueDate(${JSON.stringify(iso)}));`,
    ],
    { env: { ...process.env, TZ: tz } },
  );
  return out.toString();
}

describe("formatIssueDate", () => {
  it("returns en-US long date in UTC", () => {
    expect(formatIssueDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("is identical across America/Los_Angeles and Asia/Tokyo TZ envs", () => {
    const la = formatInChildWithTz("America/Los_Angeles", "2026-01-01");
    const tokyo = formatInChildWithTz("Asia/Tokyo", "2026-01-01");
    expect(la).toBe("January 1, 2026");
    expect(tokyo).toBe("January 1, 2026");
  });
});

describe("issueDate", () => {
  it("round-trips ISO date through UTC midnight", () => {
    const iso = "2026-05-04";
    expect(issueDate(iso).toISOString()).toBe("2026-05-04T00:00:00.000Z");
    expect(issueDate(iso).toISOString().slice(0, 10)).toBe(iso);
  });

  it("throws a descriptive error on non-YYYY-MM-DD input", () => {
    expect(() => issueDate("not-a-date")).toThrow(/YYYY-MM-DD/);
    expect(() => issueDate("2026/05/04")).toThrow(/YYYY-MM-DD/);
    expect(() => issueDate("2026-5-4")).toThrow(/YYYY-MM-DD/);
    expect(() => issueDate("")).toThrow(/YYYY-MM-DD/);
  });
});
