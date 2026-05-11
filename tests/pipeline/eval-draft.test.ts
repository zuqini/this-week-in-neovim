import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSourceContent } from "@/pipeline/bin/eval-draft";
import type { IssueMeta } from "@/lib/issues/schema";
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

describe("loadSourceContent", () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "load-source-"));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  const meta = (sources: Array<{ id: string; url: string }>): IssueMeta =>
    ({
      issue: 1,
      title: "t",
      date: "2026-05-04",
      summary: "s",
      draft: false,
      slug: "2026-05-04",
      sources: sources.map((s) => ({ id: s.id, url: s.url })),
    }) as IssueMeta;

  it("indexes top-level linkedContent.content keyed by item.url", async () => {
    const payload = {
      source: "awesome-neovim",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: "https://github.com/owner/plugin",
          linkedContent: {
            kind: "github-readme",
            url: "https://raw.githubusercontent.com/owner/plugin/HEAD/README.md",
            content: "# top-level readme",
          },
        },
      ],
    };
    await writeFile(path.join(workdir, "awesome.json"), JSON.stringify(payload));
    const result = await loadSourceContent(
      workdir,
      meta([{ id: "s1", url: "https://github.com/owner/plugin" }]),
    );
    expect(result.get("s1")?.text).toBe("# top-level readme");
  });

  it("indexes linkedContentExtras entries keyed by each extra's URL", async () => {
    const extraUrl =
      "https://raw.githubusercontent.com/owner/plugin/HEAD/README.md";
    const payload = {
      source: "reddit",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: "https://www.reddit.com/r/neovim/comments/abc/foo/",
          is_self: true,
          linkedContent: {
            kind: "reddit-self",
            url: "https://www.reddit.com/r/neovim/comments/abc/foo/",
            note: "selftext is the content",
          },
          linkedContentExtras: [
            {
              kind: "github-readme",
              url: extraUrl,
              content: "# plugin README from extras",
            },
          ],
        },
      ],
    };
    await writeFile(path.join(workdir, "reddit.json"), JSON.stringify(payload));
    const result = await loadSourceContent(
      workdir,
      meta([{ id: "s1", url: extraUrl }]),
    );
    expect(result.get("s1")?.text).toBe("# plugin README from extras");
  });

  it("indexes github-release item.body keyed by item.url", async () => {
    const releaseUrl =
      "https://github.com/neovim/neovim/releases/tag/v0.11.0";
    const payload = {
      source: "github-releases",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: releaseUrl,
          title: "neovim/neovim v0.11.0",
          tag_name: "v0.11.0",
          body: "## Highlights\n- Treesitter improvements\n- LSP autotrigger fix",
          linkedContent: {
            kind: "github-release",
            url: releaseUrl,
            note: "release notes are in item.body",
          },
        },
      ],
    };
    await writeFile(
      path.join(workdir, "github-releases.json"),
      JSON.stringify(payload),
    );
    const result = await loadSourceContent(
      workdir,
      meta([{ id: "s1", url: releaseUrl }]),
    );
    expect(result.get("s1")?.text).toContain("LSP autotrigger fix");
  });

  it("does not index github-release items with empty body", async () => {
    const releaseUrl =
      "https://github.com/owner/repo/releases/tag/v1.0.0";
    const payload = {
      source: "github-releases",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: releaseUrl,
          body: "",
          linkedContent: {
            kind: "github-release",
            url: releaseUrl,
            note: "release notes are in item.body",
          },
        },
      ],
    };
    await writeFile(
      path.join(workdir, "github-releases.json"),
      JSON.stringify(payload),
    );
    const result = await loadSourceContent(
      workdir,
      meta([{ id: "s1", url: releaseUrl }]),
    );
    expect(result.has("s1")).toBe(false);
  });

  it("indexes Reddit self-post selftext keyed by permalink", async () => {
    const permalink =
      "https://www.reddit.com/r/neovim/comments/1sxvn33/long_writeup/";
    const payload = {
      source: "reddit",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: permalink,
          permalink,
          is_self: true,
          selftext:
            "Long writeup about the statuscolumn in 97 lines of Lua\n\n![](https://preview.redd.it/abc.png)",
          linkedContent: { kind: "reddit-self", url: permalink, note: "x" },
        },
      ],
    };
    await writeFile(path.join(workdir, "reddit.json"), JSON.stringify(payload));
    const result = await loadSourceContent(
      workdir,
      meta([{ id: "s1", url: permalink }]),
    );
    expect(result.get("s1")?.text).toContain("statuscolumn in 97 lines");
  });

  it("does not index selftext for non-self posts or empty selftext", async () => {
    const payload = {
      source: "reddit",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: "https://www.reddit.com/r/neovim/comments/a/x/",
          permalink: "https://www.reddit.com/r/neovim/comments/a/x/",
          is_self: false,
          selftext: "",
          linkedContent: { kind: "github-readme", url: "https://r.example/", content: "" },
        },
        {
          url: "https://www.reddit.com/r/neovim/comments/b/y/",
          permalink: "https://www.reddit.com/r/neovim/comments/b/y/",
          is_self: true,
          selftext: "",
        },
      ],
    };
    await writeFile(path.join(workdir, "reddit.json"), JSON.stringify(payload));
    const result = await loadSourceContent(
      workdir,
      meta([
        { id: "s1", url: "https://www.reddit.com/r/neovim/comments/a/x/" },
        { id: "s2", url: "https://www.reddit.com/r/neovim/comments/b/y/" },
      ]),
    );
    expect(result.has("s1")).toBe(false);
    expect(result.has("s2")).toBe(false);
  });

  it("skips extras whose content is empty or missing", async () => {
    const payload = {
      source: "reddit",
      fetchedAt: "2026-05-04T00:00:00Z",
      params: {},
      items: [
        {
          url: "https://www.reddit.com/r/neovim/comments/abc/foo/",
          is_self: true,
          linkedContent: { kind: "reddit-self", note: "x" },
          linkedContentExtras: [
            { kind: "fetch-failed", url: "https://example.com/a", error: "x" },
            { kind: "github-readme", url: "https://example.com/b", content: "" },
          ],
        },
      ],
    };
    await writeFile(path.join(workdir, "reddit.json"), JSON.stringify(payload));
    const result = await loadSourceContent(
      workdir,
      meta([
        { id: "s1", url: "https://example.com/a" },
        { id: "s2", url: "https://example.com/b" },
      ]),
    );
    expect(result.has("s1")).toBe(false);
    expect(result.has("s2")).toBe(false);
  });
});
