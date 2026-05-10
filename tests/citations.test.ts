import { describe, expect, it } from "vitest";
import {
  extractCitationIds,
  validateCitations,
} from "@/lib/citations";

const BODY_OK = `
Some bullet that ends with a citation[^s1]. And another line[^s2].

[^s1]: First source.
[^s2]: Second source.
`;

describe("extractCitationIds", () => {
  it("collects unique ids from references and definitions", () => {
    const ids = extractCitationIds(
      "first[^s1] second[^s2] dup[^s1]\n\n[^s1]: x\n[^s2]: y\n",
    );
    expect([...ids].sort()).toEqual(["s1", "s2"]);
  });

  it("returns an empty set when there are no citations", () => {
    expect(extractCitationIds("plain prose, no citations").size).toBe(0);
  });

  it("ignores citations inside inline code spans", () => {
    const ids = extractCitationIds("see `[^sN]` placeholder and real[^s1]");
    expect([...ids]).toEqual(["s1"]);
  });

  it("ignores citations inside fenced code blocks", () => {
    const body = [
      "real[^s1]",
      "",
      "```",
      "example: [^s99]",
      "```",
      "",
      "trailing",
    ].join("\n");
    expect([...extractCitationIds(body)]).toEqual(["s1"]);
  });
});

describe("validateCitations", () => {
  it("passes when every citation resolves and every source is cited", () => {
    const meta = {
      sources: [
        { id: "s1", url: "https://example.com/1" },
        { id: "s2", url: "https://example.com/2" },
      ],
    };
    const result = validateCitations(meta, BODY_OK);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("fails when body cites an id missing from sources[]", () => {
    const meta = {
      sources: [{ id: "s1", url: "https://example.com/1" }],
    };
    const result = validateCitations(
      meta,
      "claim[^s1] and orphan[^s99]\n\n[^s1]: ok\n",
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      `Citation [^s99] in body has no matching entry in sources[].`,
    ]);
  });

  it("fails when sources[] contains an id never cited", () => {
    const meta = {
      sources: [
        { id: "s1", url: "https://example.com/1" },
        { id: "s2", url: "https://example.com/2" },
      ],
    };
    const result = validateCitations(meta, "only one[^s1]\n\n[^s1]: ok\n");
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      `Source "s2" in sources[] is never cited in body.`,
    ]);
  });

  it("fails on duplicate ids in sources[]", () => {
    const meta = {
      sources: [
        { id: "s1", url: "https://example.com/1" },
        { id: "s1", url: "https://example.com/1b" },
      ],
    };
    const result = validateCitations(meta, "claim[^s1]\n\n[^s1]: ok\n");
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      `Duplicate source id in sources[]: "s1".`,
    ]);
  });

  it("aggregates multiple errors deterministically", () => {
    const meta = {
      sources: [
        { id: "s1", url: "https://example.com/1" },
        { id: "s2", url: "https://example.com/2" },
      ],
    };
    const result = validateCitations(meta, "missing[^s99]");
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      `Citation [^s99] in body has no matching entry in sources[].`,
      `Source "s1" in sources[] is never cited in body.`,
      `Source "s2" in sources[] is never cited in body.`,
    ]);
  });

  it("treats an empty sources[] with no citations as valid", () => {
    const result = validateCitations({ sources: [] }, "no citations here");
    expect(result).toEqual({ ok: true, errors: [] });
  });
});
