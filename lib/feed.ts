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

const ESCAPE_PATTERN =
  /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]|[￾￿]|[\x00-\x08\x0B\x0C\x0E-\x1F]|[<>&'"]/g;

function escapeXml(input: string): string {
  return input.replace(ESCAPE_PATTERN, (match) => {
    if (match.length === 2) return match;
    const code = match.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return "�";
    if (code === 0xfffe || code === 0xffff) return "";
    if (code < 0x20) return "";
    return XML_ESCAPES[match] ?? match;
  });
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
