import type { IssueMeta } from "./issues";
import { issueDate } from "./date";
import { absoluteUrl, issueHref, SITE } from "./site";

const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&#39;",
  '"': "&quot;",
};

function isXmlAllowedCodePoint(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return true;
  if (cp < 0x20) return false;
  if (cp >= 0xfdd0 && cp <= 0xfdef) return false;
  const low16 = cp & 0xffff;
  if (low16 === 0xfffe || low16 === 0xffff) return false;
  return true;
}

function escapeXml(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; ) {
    const code = input.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        if (isXmlAllowedCodePoint(cp)) out += input.slice(i, i + 2);
        i += 2;
        continue;
      }
      out += "�";
      i += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "�";
      i += 1;
      continue;
    }

    const ch = input[i];
    const esc = XML_ESCAPES[ch];
    if (esc !== undefined) {
      out += esc;
    } else if (isXmlAllowedCodePoint(code)) {
      out += ch;
    }
    i += 1;
  }
  return out;
}

export function buildRssXml(issues: IssueMeta[]): string {
  const lastBuild = issues[0]
    ? issueDate(issues[0].date).toUTCString()
    : new Date(0).toUTCString();

  const items = issues
    .map((issue) => {
      const url = escapeXml(absoluteUrl(issueHref(issue.slug)));
      const pub = issueDate(issue.date).toUTCString();
      return `    <item>
      <title>${escapeXml(issue.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pub}</pubDate>
      <description>${escapeXml(issue.summary)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${escapeXml(SITE.url)}</link>
    <atom:link href="${escapeXml(absoluteUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE.description)}</description>
    <language>en-US</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}
