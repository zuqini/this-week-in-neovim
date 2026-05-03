import { describe, expect, it } from "vitest";
import { formatIssueDate, issueDate } from "@/lib/date";

describe("formatIssueDate", () => {
  it("returns en-US long date in UTC", () => {
    expect(formatIssueDate("2026-01-01")).toBe("January 1, 2026");
  });
});

describe("issueDate", () => {
  it("round-trips ISO date through UTC midnight", () => {
    const iso = "2026-05-04";
    expect(issueDate(iso).toISOString()).toBe("2026-05-04T00:00:00.000Z");
    expect(issueDate(iso).toISOString().slice(0, 10)).toBe(iso);
  });
});
