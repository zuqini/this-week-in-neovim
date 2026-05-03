import { getAllIssues } from "@/lib/issues";
import { buildRssXml } from "@/lib/feed";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildRssXml(getAllIssues()), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
