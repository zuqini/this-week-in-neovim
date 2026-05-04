import "server-only";
import { loadIssueBody } from "@/lib/issues/body";

export async function IssueBody({ slug }: { slug: string }) {
  const Body = await loadIssueBody(slug);
  return (
    <div className="prose max-w-none">
      <Body />
    </div>
  );
}
