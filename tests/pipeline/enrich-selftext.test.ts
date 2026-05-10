import { describe, expect, it } from "vitest";
import {
  extractEnrichableExtraUrls,
  extractUrls,
} from "@/pipeline/src/enrich/selftext";

describe("extractUrls", () => {
  it("extracts markdown links", () => {
    const text = "See [matugen.nvim](https://github.com/daedlock/matugen.nvim) for details.";
    expect(extractUrls(text)).toEqual([
      "https://github.com/daedlock/matugen.nvim",
    ]);
  });

  it("extracts bare URLs", () => {
    const text = "Repo lives at https://github.com/owner/repo and was great.";
    expect(extractUrls(text)).toEqual([
      "https://github.com/owner/repo",
    ]);
  });

  it("dedupes URLs across markdown and bare forms", () => {
    const text =
      "[link](https://github.com/a/b) and again at https://github.com/a/b.";
    expect(extractUrls(text)).toEqual(["https://github.com/a/b"]);
  });

  it("strips trailing punctuation from bare URLs", () => {
    const text = "Try https://example.com/post. or https://example.com/x).";
    expect(extractUrls(text)).toEqual([
      "https://example.com/post",
      "https://example.com/x",
    ]);
  });

  it("preserves order of first occurrence", () => {
    const text =
      "First: [a](https://a.example) then bare https://b.example then [c](https://c.example)";
    expect(extractUrls(text)).toEqual([
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ]);
  });

  it("returns empty for text with no URLs", () => {
    expect(extractUrls("just words, no links")).toEqual([]);
  });
});

describe("extractEnrichableExtraUrls", () => {
  it("filters to enrichable kinds and excludes own URL", () => {
    const own = "https://www.reddit.com/r/neovim/comments/abc/x/";
    const text =
      "Plugin at [matugen](https://github.com/daedlock/matugen.nvim). Discussion at https://www.reddit.com/r/neovim/comments/abc/x/. Image at https://i.redd.it/foo.png. Internal /r/neovim/comments/xyz.";
    expect(extractEnrichableExtraUrls(text, own)).toEqual([
      "https://github.com/daedlock/matugen.nvim",
    ]);
  });

  it("keeps videos but drops reddit-self and reddit-media", () => {
    const text =
      "Video [demo](https://youtu.be/abc), reddit https://old.reddit.com/r/x/, image https://preview.redd.it/y.jpg.";
    expect(extractEnrichableExtraUrls(text, "https://example.com/own")).toEqual([
      "https://youtu.be/abc",
    ]);
  });

  it("returns empty when selftext has no enrichable URLs", () => {
    expect(
      extractEnrichableExtraUrls("plain text", "https://example.com"),
    ).toEqual([]);
  });
});
