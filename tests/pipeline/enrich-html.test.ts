import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchArticle, htmlToMarkdown } from "@/pipeline/src/enrich/html";

async function loadFixture(name: string): Promise<string> {
  const p = path.resolve(__dirname, "../fixtures/enrich", name);
  return readFile(p, "utf8");
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

describe("htmlToMarkdown", () => {
  it("extracts the article body and converts to markdown", async () => {
    const html = await loadFixture("sample-blog.html");
    const md = htmlToMarkdown(html, "https://example.com/post");
    expect(md).toContain("Why bother");
    expect(md).toContain("Plugin managers in Neovim");
    expect(md).not.toContain("Footer junk");
    expect(md).not.toContain("Home");
  });
});

describe("fetchArticle", () => {
  it("fetches HTML and returns markdown content", async () => {
    const html = await loadFixture("sample-blog.html");
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(html));
    const result = await fetchArticle("https://example.com/post", { fetch: fetchMock });
    expect(result.source).toBe("html-article");
    expect(result.url).toBe("https://example.com/post");
    expect(result.content).toContain("Neovim");
    expect(result.content).not.toContain("Footer junk");
  });

  it("sets a User-Agent header", async () => {
    const html = await loadFixture("sample-blog.html");
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(html));
    await fetchArticle("https://example.com/post", { fetch: fetchMock });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("this-week-in-neovim");
  });

  it("throws on non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse("nope", 502));
    await expect(
      fetchArticle("https://example.com/x", { fetch: fetchMock }),
    ).rejects.toThrow(/502/);
  });

  it("truncates content past maxBytes", async () => {
    const big = "<html><body><article><h1>T</h1>" +
      "<p>" + "word ".repeat(5000) + "</p>" +
      "</article></body></html>";
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(big));
    const result = await fetchArticle("https://example.com/big", {
      fetch: fetchMock,
      maxBytes: 1024,
    });
    expect(Buffer.byteLength(result.content, "utf8")).toBeLessThanOrEqual(1024);
  });
});
