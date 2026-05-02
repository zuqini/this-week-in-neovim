import type { IssueMeta } from "@/lib/issues";

export async function IssueBody({ issue }: { issue: IssueMeta }) {
  const mod = await import(`@/content/issues/${issue.slug}.mdx`);
  const Body = mod.default as React.ComponentType;
  return (
    <div className="prose max-w-none">
      <Body />
    </div>
  );
}
