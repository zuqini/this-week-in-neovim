import { classify, type LinkKind } from "./classifier.js";

const URL_RE =
  /\[[^\]]*\]\(([^)\s]+)\)|\bhttps?:\/\/[^\s<>()[\]"'`]+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/;

export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[1] ?? m[0];
    const url = raw.replace(TRAILING_PUNCT_RE, "");
    if (url === "" || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function isEnrichableExtra(kind: LinkKind): boolean {
  switch (kind.kind) {
    case "github-readme":
    case "html-article":
    case "video":
      return true;
    case "github-release":
    case "reddit-self":
    case "reddit-media":
    case "unknown":
      return false;
  }
}

export function extractEnrichableExtraUrls(
  selftext: string,
  ownUrl: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([ownUrl]);
  for (const url of extractUrls(selftext)) {
    if (seen.has(url)) continue;
    seen.add(url);
    if (isEnrichableExtra(classify(url))) out.push(url);
  }
  return out;
}
