import { describe, expect, it, vi } from "vitest";
import { countWords, evalDraft } from "@/pipeline/src/eval/index";

function ok200() {
  return new Response(null, { status: 200 });
}

const META = {
  sources: [
    { id: "s1", url: "https://a.example/" },
    { id: "s2", url: "https://b.example/" },
  ],
};
const BODY = [
  "First bullet has a citation[^s1].",
  "Second bullet too[^s2].",
  "",
  "[^s1]: A.",
  "[^s2]: B.",
].join("\n");

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("ignores fenced code blocks", () => {
    const body = ["prose here", "", "```", "inside code", "```", ""].join("\n");
    expect(countWords(body)).toBe(2);
  });

  it("ignores inline code spans", () => {
    expect(countWords("see `print(x)` here")).toBe(2);
  });

  it("ignores footnote definitions", () => {
    expect(countWords("hello[^s1]\n\n[^s1]: not counted")).toBe(1);
  });
});

describe("evalDraft", () => {
  it("passes when citations resolve, links are live, and word count is in bounds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok200());
    const report = await evalDraft(META, BODY, {
      fetch: fetchMock,
      minWords: 1,
      maxWords: 100,
    });
    expect(report.ok).toBe(true);
    expect(report.citations.ok).toBe(true);
    expect(report.links.ok).toBe(true);
    expect(report.links.total).toBe(2);
    expect(report.wordCount.ok).toBe(true);
  });

  it("fails on unresolved citation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok200());
    const body = "claim[^s1] orphan[^s99]\n\n[^s1]: x";
    const report = await evalDraft(META, body, {
      fetch: fetchMock,
      minWords: 1,
      maxWords: 100,
    });
    expect(report.ok).toBe(false);
    expect(report.citations.ok).toBe(false);
    expect(report.citations.errors).toContain(
      "Citation [^s99] in body has no matching entry in sources[].",
    );
  });

  it("fails on dead URL", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      return url.includes("b.example") ? new Response(null, { status: 404 }) : ok200();
    });
    const report = await evalDraft(META, BODY, {
      fetch: fetchMock,
      minWords: 1,
      maxWords: 100,
    });
    expect(report.ok).toBe(false);
    expect(report.links.ok).toBe(false);
    expect(report.links.failures).toHaveLength(1);
    expect(report.links.failures[0].url).toBe("https://b.example/");
    expect(report.links.failures[0].status).toBe(404);
  });

  it("fails when below minWords", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok200());
    const report = await evalDraft(META, BODY, {
      fetch: fetchMock,
      minWords: 1000,
    });
    expect(report.wordCount.ok).toBe(false);
    expect(report.wordCount.count).toBeLessThan(1000);
    expect(report.wordCount.min).toBe(1000);
  });

  it("fails when above maxWords", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok200());
    const report = await evalDraft(META, BODY, {
      fetch: fetchMock,
      minWords: 1,
      maxWords: 2,
    });
    expect(report.wordCount.ok).toBe(false);
    expect(report.wordCount.count).toBeGreaterThan(2);
    expect(report.wordCount.max).toBe(2);
  });

  it("skipLinks bypasses URL fetches", async () => {
    const fetchMock = vi.fn();
    const report = await evalDraft(META, BODY, {
      fetch: fetchMock,
      skipLinks: true,
      minWords: 1,
      maxWords: 100,
    });
    expect(report.links.skipped).toBe(true);
    expect(report.links.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
