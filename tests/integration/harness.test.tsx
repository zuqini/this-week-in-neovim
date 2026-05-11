import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import matter from "gray-matter";
import { renderToStaticMarkup } from "react-dom/server";
import { scrapeReddit, type RedditScrape } from "@/pipeline/src/sources/reddit/scrape";
import type { RedditClient } from "@/pipeline/src/sources/reddit/client";
import { enrichBatch, type EnrichedItem } from "@/pipeline/src/enrich/run";
import { rawScrapeEnvelopeSchema } from "@/pipeline/src/types";
import { parseIssueMeta } from "@/lib/issues/schema";
import { validateCitations } from "@/lib/citations";
import {
  typedImport,
  withMockedIssues,
  withResetIssuesModule,
} from "../helpers/mock-issues";

vi.mock("@/components/issue-body", () => ({
  IssueBody: ({ slug }: { slug: string }) => (
    <div data-issue-body={slug}>[issue body stub]</div>
  ),
}));

const FIXTURE_LISTING = path.resolve(
  import.meta.dirname,
  "../fixtures/reddit/listing-top-week.json",
);
const FIXTURE_COMMENTS_MATUGEN = path.resolve(
  import.meta.dirname,
  "../fixtures/reddit/comments-matugen.json",
);

const ITEM_COUNT = 5;
const MATUGEN_PERMALINK_PATH =
  "/r/neovim/comments/1sy9bib/dynamic_neovim_theme_generation_with_matugen/";

interface ProjectionInput {
  issue: number;
  date: string;
  title: string;
  summary: string;
  items: EnrichedItem[];
}

function draftProjection(input: ProjectionInput): { slug: string; mdx: string } {
  const slug = input.date;
  const sources = input.items.map((item, i) => ({
    id: `s${i + 1}`,
    url: item.url,
    title: typeof item.title === "string" ? item.title : item.url,
  }));
  const bullets = input.items.map(
    (_, i) => `- Reddit post ${i + 1}.[^s${i + 1}]`,
  );
  const defs = sources.map((s) => `[^${s.id}]: ${s.title}`);
  const body = ["## New plugins", "", ...bullets, "", ...defs, ""].join("\n");
  const fm = yaml.dump({
    issue: input.issue,
    title: input.title,
    date: input.date,
    summary: input.summary,
    sources,
  });
  return { slug, mdx: `---\n${fm}---\n\n${body}` };
}

function stubFetch(): typeof fetch {
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.github.com") || url.includes("raw.githubusercontent.com")) {
      return new Response("# Canned README\n\nFixture content.", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("<html><body><article>Canned article body.</article></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
  return mock as unknown as typeof fetch;
}

function stubRedditClient(listing: unknown, matugenComments: unknown): RedditClient {
  return {
    fetchListing: async () => listing,
    fetchComments: async (permalink) =>
      permalink === MATUGEN_PERMALINK_PATH
        ? matugenComments
        : [{}, { data: { children: [] } }],
  };
}

describe("harness integration (scrape → enrich → draft → render)", () => {
  withResetIssuesModule();

  it("round-trips a Reddit fixture through the pipeline-site seam", async () => {
    // 1. Raw scrape from fixtures, projected through the real scraper.
    const listing = JSON.parse(readFileSync(FIXTURE_LISTING, "utf8"));
    const comments = JSON.parse(readFileSync(FIXTURE_COMMENTS_MATUGEN, "utf8"));
    const scraped: RedditScrape = await scrapeReddit(
      { subreddit: "neovim", timeframe: "week", limit: 50 },
      stubRedditClient(listing, comments),
    );
    expect(scraped.source).toBe("reddit");
    expect(scraped.items.length).toBeGreaterThan(0);
    const matugen = scraped.items.find((p) =>
      p.permalink.endsWith(MATUGEN_PERMALINK_PATH),
    );
    expect(matugen?.top_comments?.length).toBeGreaterThan(0);

    // The scrape envelope is what enrich-links.ts validates on disk.
    const envelope = rawScrapeEnvelopeSchema.parse(
      JSON.parse(JSON.stringify(scraped)),
    );
    expect(envelope.source).toBe("reddit");

    // 2. Enrich a small slice with a stubbed fetch — no real network.
    // ProjectedPost is structurally compatible with EnrichItem (has `url`);
    // the cast mirrors `pipeline/bin/enrich-links.ts` reading `envelope.items`.
    const slice = scraped.items.slice(0, ITEM_COUNT) as unknown as Parameters<
      typeof enrichBatch
    >[0];
    const enriched = await enrichBatch(slice, { fetch: stubFetch() });
    expect(enriched).toHaveLength(ITEM_COUNT);
    for (const e of enriched) {
      expect(e.linkedContent).not.toBeNull();
      expect(e.linkedContent?.kind).not.toBe("fetch-failed");
    }

    // 3. Hand-crafted projection — the LLM-free equivalent of the drafter.
    const { slug, mdx } = draftProjection({
      issue: 99,
      date: "2026-05-11",
      title: "Harness integration fixture",
      summary: "Synthetic issue used by the end-to-end harness test.",
      items: enriched,
    });

    // 4. Frontmatter must parse via the site's Zod schema.
    const meta = parseIssueMeta(mdx, slug);
    expect(meta.slug).toBe(slug);
    expect(meta.issue).toBe(99);
    expect(meta.sources).toHaveLength(ITEM_COUNT);
    expect(meta.sources[0].id).toBe("s1");

    // 5. Every [^sN] in body must resolve via the citation validator.
    const { content: body } = matter(mdx);
    const cites = validateCitations(meta, body);
    expect(cites.ok).toBe(true);
    expect(cites.errors).toEqual([]);

    // 6. Render the issue page (IssueBody stubbed, getAllIssues mocked).
    withMockedIssues([meta]);
    const { default: IssuePage } = await typedImport<
      typeof import("@/app/issues/[slug]/page")
    >("@/app/issues/[slug]/page");
    const tree = await IssuePage({ params: Promise.resolve({ slug }) });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain("Issue #99");
    expect(html).toContain('dateTime="2026-05-11"');
    expect(html).toContain("Harness integration fixture");
    expect(html).toContain("Synthetic issue used by the end-to-end harness test.");
    expect(html).toContain("[issue body stub]");
  });
});
