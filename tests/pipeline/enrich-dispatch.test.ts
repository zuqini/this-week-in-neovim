import { describe, expect, it, vi } from "vitest";
import { enrich } from "@/pipeline/src/enrich/index";

function ok(body: string, type = "text/plain"): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": type } });
}

describe("enrich (dispatch)", () => {
  it("dispatches github URLs to the github fetcher", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok("# README\n\nbody"));
    const out = await enrich(
      { url: "https://github.com/folke/lazy.nvim" },
      { fetch: fetchMock },
    );
    expect(out?.kind).toBe("github-readme");
    if (out && out.kind === "github-readme") {
      expect(out.content).toContain("README");
    }
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("raw.githubusercontent.com/folke/lazy.nvim");
  });

  it("dispatches html articles to the html fetcher", async () => {
    const html = "<html><body><article><h1>T</h1><p>Substantive paragraph one with enough words to look like real prose so Readability picks it up.</p><p>Second supporting paragraph that adds more substance to the article body.</p></article></body></html>";
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(html, "text/html"));
    const out = await enrich(
      { url: "https://example.com/post" },
      { fetch: fetchMock },
    );
    expect(out?.kind).toBe("html-article");
  });

  it("returns a video stub for v.redd.it without fetching", async () => {
    const fetchMock = vi.fn();
    const out = await enrich({ url: "https://v.redd.it/abc" }, { fetch: fetchMock });
    expect(out?.kind).toBe("video");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a reddit-self stub for /r/.../comments/...", async () => {
    const fetchMock = vi.fn();
    const out = await enrich(
      { url: "https://www.reddit.com/r/neovim/comments/abc/x/" },
      { fetch: fetchMock },
    );
    expect(out?.kind).toBe("reddit-self");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for unknown protocols", async () => {
    const out = await enrich({ url: "ftp://example.com" });
    expect(out).toBeNull();
  });
});
