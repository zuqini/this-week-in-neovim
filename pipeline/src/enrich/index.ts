import { classify, type LinkKind } from "./classifier.js";
import { fetchReadme, type FetchReadmeOpts } from "./github.js";
import { fetchArticle, type FetchArticleOpts } from "./html.js";

export type EnrichedLink =
  | { kind: "github-readme"; url: string; content: string }
  | { kind: "github-release"; url: string; note: string }
  | { kind: "html-article"; url: string; content: string }
  | { kind: "video"; url: string; note: string }
  | { kind: "reddit-self"; url: string; note: string }
  | { kind: "reddit-media"; url: string; note: string }
  | { kind: "fetch-failed"; url: string; error: string };

export interface EnrichItem {
  url: string;
  [key: string]: unknown;
}

export interface EnrichOpts {
  fetch?: typeof fetch;
  userAgent?: string;
  maxBytes?: number;
}

export { classify } from "./classifier.js";
export type { LinkKind } from "./classifier.js";

export async function enrich(
  item: EnrichItem,
  opts: EnrichOpts = {},
): Promise<EnrichedLink | null> {
  const kind = classify(item.url);
  return enrichByKind(kind, opts);
}

export async function enrichByKind(
  kind: LinkKind,
  opts: EnrichOpts = {},
): Promise<EnrichedLink | null> {
  const fetcherOpts: FetchReadmeOpts & FetchArticleOpts = {
    fetch: opts.fetch,
    userAgent: opts.userAgent,
    maxBytes: opts.maxBytes,
  };

  switch (kind.kind) {
    case "github-readme": {
      const result = await fetchReadme(
        { owner: kind.owner, repo: kind.repo, ref: kind.ref },
        fetcherOpts,
      );
      return {
        kind: "github-readme",
        url: result.url,
        content: result.content,
      };
    }
    case "github-release":
      return {
        kind: "github-release",
        url: kind.url,
        note: "github release; release notes are in item.body",
      };
    case "html-article": {
      const result = await fetchArticle(kind.url, fetcherOpts);
      return {
        kind: "html-article",
        url: result.url,
        content: result.content,
      };
    }
    case "video":
      return {
        kind: "video",
        url: kind.url,
        note: "video; content unavailable for citation",
      };
    case "reddit-self":
      return {
        kind: "reddit-self",
        url: kind.url,
        note: "reddit self-post; selftext is the content",
      };
    case "reddit-media":
      return {
        kind: "reddit-media",
        url: kind.url,
        note: "reddit-hosted image; content unavailable for citation",
      };
    case "unknown":
      return null;
  }
}
