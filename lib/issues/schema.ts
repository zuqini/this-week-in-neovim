import matter from "gray-matter";
import yaml from "js-yaml";
import { z } from "zod";

const YAML_ENGINE = {
  parse: (input: string) => yaml.load(input) as object,
  stringify: (input: object) => yaml.dump(input),
};

const SourceSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  fetched_at: z.string().optional(),
  title: z.string().optional(),
});

const FrontmatterSchema = z.object({
  issue: z.number().int().positive(),
  title: z.string().min(1),
  date: z.preprocess((v) => {
    if (v instanceof Date) {
      if (
        v.getUTCHours() !== 0 ||
        v.getUTCMinutes() !== 0 ||
        v.getUTCSeconds() !== 0 ||
        v.getUTCMilliseconds() !== 0
      ) {
        return undefined;
      }
      return v.toISOString().slice(0, 10);
    }
    return v;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  summary: z.string().min(1),
  draft: z.boolean().optional().default(false),
  sources: z.array(SourceSchema).default([]),
});

type IssueFrontmatter = z.infer<typeof FrontmatterSchema>;

export interface IssueMeta extends IssueFrontmatter {
  slug: string;
}

export function parseIssueMeta(raw: string, slug: string): IssueMeta {
  const { data } = matter(raw, { engines: { yaml: YAML_ENGINE } });
  const parsed = FrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid frontmatter in ${slug}.mdx: ${parsed.error.message}`,
    );
  }
  const slugDate = slug.slice(0, 10);
  if (slugDate !== parsed.data.date) {
    throw new Error(
      `Slug/date mismatch in ${slug}.mdx: filename starts with ${slugDate} but frontmatter date is ${parsed.data.date}`,
    );
  }
  return { ...parsed.data, slug };
}
