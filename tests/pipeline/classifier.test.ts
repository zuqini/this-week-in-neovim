import { describe, expect, it } from "vitest";
import { classify } from "@/pipeline/src/enrich/classifier";

describe("classify", () => {
  it("classifies github.com/{owner}/{repo} as github-readme", () => {
    const k = classify("https://github.com/folke/lazy.nvim");
    expect(k).toEqual({ kind: "github-readme", owner: "folke", repo: "lazy.nvim" });
  });

  it("strips trailing .git on github URLs", () => {
    const k = classify("https://github.com/folke/lazy.nvim.git");
    expect(k).toEqual({ kind: "github-readme", owner: "folke", repo: "lazy.nvim" });
  });

  it("captures ref from /tree/<branch>", () => {
    const k = classify("https://github.com/owner/repo/tree/develop");
    expect(k).toEqual({
      kind: "github-readme",
      owner: "owner",
      repo: "repo",
      ref: "develop",
    });
  });

  it("captures multi-segment refs", () => {
    const k = classify("https://github.com/owner/repo/tree/release/v1.2");
    expect(k).toEqual({
      kind: "github-readme",
      owner: "owner",
      repo: "repo",
      ref: "release/v1.2",
    });
  });

  it("does not classify github.com/topics/* as a repo", () => {
    const k = classify("https://github.com/topics/neovim-plugin");
    expect(k.kind).toBe("html-article");
  });

  it("classifies v.redd.it as video", () => {
    const k = classify("https://v.redd.it/abc123");
    expect(k).toEqual({ kind: "video", url: "https://v.redd.it/abc123" });
  });

  it("classifies youtube as video", () => {
    expect(classify("https://www.youtube.com/watch?v=abc").kind).toBe("video");
    expect(classify("https://youtu.be/abc").kind).toBe("video");
  });

  it("classifies vimeo as video", () => {
    expect(classify("https://vimeo.com/123456").kind).toBe("video");
  });

  it("classifies www.reddit.com /r/.../comments/... as reddit-self", () => {
    const url = "https://www.reddit.com/r/neovim/comments/abc123/title_slug/";
    const k = classify(url);
    expect(k).toEqual({ kind: "reddit-self", url });
  });

  it("classifies generic blogs as html-article", () => {
    const k = classify("https://example.com/posts/2026/great-post");
    expect(k).toEqual({ kind: "html-article", url: "https://example.com/posts/2026/great-post" });
  });

  it("returns unknown for non-http(s) urls", () => {
    expect(classify("ftp://example.com").kind).toBe("unknown");
  });

  it("returns unknown for malformed urls", () => {
    expect(classify("not a url").kind).toBe("unknown");
  });
});
