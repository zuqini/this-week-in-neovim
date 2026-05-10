import type { RawScrapePayload } from "../../types.js";
import { defaultClient, type RedditClient, type Timeframe } from "./client.js";

const POST_FIELDS = [
  "title",
  "author",
  "permalink",
  "url",
  "is_self",
  "selftext",
  "link_flair_text",
  "score",
  "upvote_ratio",
  "num_comments",
  "created_utc",
  "id",
] as const;

const COMMENT_FIELDS = ["id", "author", "score", "body", "created_utc"] as const;

const TOP_COMMENTS_LIMIT = 5;
const COMMENTS_FETCH_LIMIT = 20;
const COMMENTS_FETCH_DEPTH = 1;

export interface ScrapeOptions {
  subreddit: string;
  timeframe: Timeframe;
  limit: number;
  withComments?: boolean;
}

export interface ProjectedComment {
  id: string;
  author: string;
  score: number;
  body: string;
  created_utc: number;
}

export interface ProjectedPost {
  title: string;
  author: string;
  permalink: string;
  url: string;
  is_self: boolean;
  selftext: string;
  link_flair_text: string | null;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  id: string;
  top_comments?: ProjectedComment[];
}

export interface RedditScrape extends RawScrapePayload<ProjectedPost, ScrapeOptions> {
  source: "reddit";
  subreddit: string;
}

export function projectPost(d: any): ProjectedPost {
  const out: Record<string, any> = {};
  for (const k of POST_FIELDS) out[k] = d[k];
  out.permalink = `https://www.reddit.com${d.permalink}`;
  return out as ProjectedPost;
}

export function projectComment(c: any): ProjectedComment {
  const out: Record<string, any> = {};
  for (const k of COMMENT_FIELDS) out[k] = c[k];
  return out as ProjectedComment;
}

function extractTopComments(raw: unknown): ProjectedComment[] {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const commentsListing = raw[1] as { data?: { children?: unknown[] } };
  const children = commentsListing?.data?.children;
  if (!Array.isArray(children)) return [];
  const projected: ProjectedComment[] = [];
  for (const child of children) {
    const c = child as { kind?: string; data?: any };
    if (c.kind !== "t1" || !c.data) continue;
    projected.push(projectComment(c.data));
  }
  projected.sort((a, b) => b.score - a.score);
  return projected.slice(0, TOP_COMMENTS_LIMIT);
}

export async function scrapeReddit(
  options: ScrapeOptions,
  client: RedditClient = defaultClient(),
): Promise<RedditScrape> {
  const { subreddit, timeframe, limit, withComments = true } = options;

  const listing = (await client.fetchListing({ subreddit, timeframe, limit })) as {
    data?: { children?: { data: any }[] };
  };
  const children = listing?.data?.children ?? [];
  const items: ProjectedPost[] = children.map((c) => projectPost(c.data));

  if (withComments) {
    for (const post of items) {
      const path = post.permalink.replace(/^https:\/\/www\.reddit\.com/, "");
      const raw = await client.fetchComments(path, {
        limit: COMMENTS_FETCH_LIMIT,
        depth: COMMENTS_FETCH_DEPTH,
      });
      post.top_comments = extractTopComments(raw);
    }
  }

  return {
    source: "reddit",
    subreddit,
    fetchedAt: new Date().toISOString(),
    params: options,
    items,
  };
}
