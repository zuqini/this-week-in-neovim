import { getAllIssues } from "@/lib/issues";
import { SITE, absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

function escapeXml(input: string): string {
  return input.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

export function GET() {
  const issues = getAllIssues();
  const lastBuild = issues[0]
    ? new Date(`${issues[0].date}T00:00:00Z`).toUTCString()
    : new Date().toUTCString();

  const items = issues
    .map((issue) => {
      const url = absoluteUrl(`/issues/${issue.slug}/`);
      const pub = new Date(`${issue.date}T00:00:00Z`).toUTCString();
      return `    <item>
      <title>${escapeXml(issue.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pub}</pubDate>
      <description>${escapeXml(issue.summary)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${SITE.url}</link>
    <atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE.description)}</description>
    <language>en-US</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
