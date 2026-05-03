import { getAllIssues } from "@/lib/issues";
import { buildRssXml } from "@/lib/feed";

export const dynamic = "force-static";

export function GET() {
  // Headers are configured in public/_headers (Cloudflare Pages serves the static export).
  return new Response(buildRssXml(getAllIssues()));
}
