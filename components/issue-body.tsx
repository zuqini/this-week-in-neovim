import { loadIssueBody, type IssueMeta } from "@/lib/issues";

export async function IssueBody({ issue }: { issue: IssueMeta }) {
  const Body = await loadIssueBody(issue.slug);
  return (
    <div className="prose max-w-none">
      <Body />
    </div>
  );
}
