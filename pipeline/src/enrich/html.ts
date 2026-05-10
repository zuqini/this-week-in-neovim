import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { DEFAULT_USER_AGENT } from "../http.js";

export interface ArticleResult {
  content: string;
  source: "html-article";
  url: string;
}

export interface FetchArticleOpts {
  fetch?: typeof fetch;
  userAgent?: string;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 8 * 1024;

export async function fetchArticle(
  url: string,
  opts: FetchArticleOpts = {},
): Promise<ArticleResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const response = await fetchImpl(url, {
    headers: { "User-Agent": userAgent, Accept: "text/html,*/*" },
  });

  if (!response.ok) {
    throw new Error(`HTML fetch failed: ${response.status} for ${url}`);
  }

  const html = await response.text();
  const markdown = htmlToMarkdown(html, url);

  return {
    content: truncate(markdown, maxBytes),
    source: "html-article",
    url,
  };
}

export function htmlToMarkdown(html: string, url: string): string {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const sourceHtml = article?.content ?? html;
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  const markdown = turndown.turndown(sourceHtml);
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

function truncate(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) {
    return content;
  }
  let lo = 0;
  let hi = content.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (Buffer.byteLength(content.slice(0, mid), "utf8") <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return content.slice(0, lo).trimEnd();
}
