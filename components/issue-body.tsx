import "server-only";
import type { ComponentType } from "react";

const SLUG_SHAPE = /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/;

export async function loadIssueBody(slug: string): Promise<ComponentType> {
  if (!SLUG_SHAPE.test(slug)) {
    throw new Error(`Invalid issue slug: ${slug}`);
  }
  const mod = await import(`../content/issues/${slug}.mdx`);
  return mod.default;
}

export async function IssueBody({ slug }: { slug: string }) {
  const Body = await loadIssueBody(slug);
  return (
    <div className="prose max-w-none">
      <Body />
    </div>
  );
}
