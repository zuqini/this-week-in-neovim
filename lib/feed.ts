import type { IssueMeta } from "./issues";
import { issueDate } from "./date";
import { absoluteUrl, issueHref, SITE } from "./site";
import { escapeXml } from "./xml";

export function buildRssXml(issues: IssueMeta[]): string {
  const lastBuildMs = issues.length
    ? Math.max(...issues.map((i) => issueDate(i.date).getTime()))
    : 0;
  const lastBuild = new Date(lastBuildMs).toUTCString();

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
