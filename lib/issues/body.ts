import "server-only";
import type { ComponentType } from "react";
import { SLUG_SHAPE } from "./schema";

export async function loadIssueBody(slug: string): Promise<ComponentType> {
  if (!SLUG_SHAPE.test(slug)) {
    throw new Error(`Invalid issue slug: ${slug}`);
  }
  const mod = await import(`../../content/issues/${slug}.mdx`);
  return mod.default;
}
