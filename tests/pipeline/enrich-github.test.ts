import { describe, expect, it, vi } from "vitest";
import { fetchReadme } from "@/pipeline/src/enrich/github";

function ok(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } });
}

function notFound(): Response {
  return new Response("not found", { status: 404 });
}

describe("fetchReadme", () => {
  it("returns README.md content on first hit", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok("# Hello\n\nA plugin."));
    const result = await fetchReadme(
      { owner: "folke", repo: "lazy.nvim" },
      { fetch: fetchMock },
    );
    expect(result.source).toBe("github-readme");
    expect(result.content).toContain("# Hello");
    expect(result.url).toBe(
      "https://raw.githubusercontent.com/folke/lazy.nvim/HEAD/README.md",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses provided ref when supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok("# X"));
    await fetchReadme(
      { owner: "o", repo: "r", ref: "main" },
      { fetch: fetchMock },
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://raw.githubusercontent.com/o/r/main/README.md");
  });

  it("falls back through README.md → readme.md → README.MD → README on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(ok("plain readme body"));

    const result = await fetchReadme({ owner: "o", repo: "r" }, { fetch: fetchMock });
    expect(result.content).toBe("plain readme body");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toMatch(/\/README\.md$/);
    expect(urls[1]).toMatch(/\/readme\.md$/);
    expect(urls[2]).toMatch(/\/README\.MD$/);
    expect(urls[3]).toMatch(/\/README$/);
  });

  it("throws if every variant 404s", async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFound());
    await expect(
      fetchReadme({ owner: "o", repo: "r" }, { fetch: fetchMock }),
    ).rejects.toThrow(/not found/i);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws immediately on non-404 errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("server err", { status: 500 }));
    await expect(
      fetchReadme({ owner: "o", repo: "r" }, { fetch: fetchMock }),
    ).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("truncates content past maxBytes", async () => {
    const long = "# Heading\n" + "a".repeat(5000) + "\n# Section\n" + "b".repeat(5000);
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(long));
    const result = await fetchReadme(
      { owner: "o", repo: "r" },
      { fetch: fetchMock, maxBytes: 4000 },
    );
    expect(Buffer.byteLength(result.content, "utf8")).toBeLessThanOrEqual(4000);
  });

  it("truncates at a header boundary when one is available", async () => {
    const head = "# Heading\nintro text\n";
    const filler = "x".repeat(2500);
    const middleHeader = "\n# Section Two\n";
    const tail = "y".repeat(2500);
    const long = head + filler + middleHeader + tail;
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(long));
    const result = await fetchReadme(
      { owner: "o", repo: "r" },
      { fetch: fetchMock, maxBytes: 4000 },
    );
    expect(result.content).not.toContain("# Section Two");
    expect(result.content.trimEnd().endsWith("x")).toBe(true);
    expect(Buffer.byteLength(result.content, "utf8")).toBeLessThanOrEqual(4000);
  });

  it("sets a User-Agent header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok("# X"));
    await fetchReadme({ owner: "o", repo: "r" }, { fetch: fetchMock });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("this-week-in-neovim");
  });
});
