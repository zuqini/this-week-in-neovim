import type { RawScrapePayload } from "../../types.js";
import { defaultClient, type RedditClient, type Timeframe } from "./client.js";
import {
  redditCommentDataSchema,
  redditCommentsResponseSchema,
  redditPostListingSchema,
  type RedditCommentData,
  type RedditPostData,
} from "./schema.js";

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

export function projectPost(d: RedditPostData): ProjectedPost {
  return {
    title: d.title,
    author: d.author,
    permalink: `https://www.reddit.com${d.permalink}`,
    url: d.url,
    is_self: d.is_self,
    selftext: d.selftext,
    link_flair_text: d.link_flair_text,
    score: d.score,
    upvote_ratio: d.upvote_ratio,
    num_comments: d.num_comments,
    created_utc: d.created_utc,
    id: d.id,
  };
}

export function projectComment(c: RedditCommentData): ProjectedComment {
  return {
    id: c.id,
    author: c.author,
    score: c.score,
    body: c.body,
    created_utc: c.created_utc,
  };
}

function parseListing(raw: unknown) {
  const parsed = redditPostListingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length === 0 ? "(root)" : issue.path.join(".");
    throw new Error(
      `reddit listing schema mismatch at ${where}: ${issue.message}`,
    );
  }
  return parsed.data;
}

function extractTopComments(raw: unknown): ProjectedComment[] {
  const parsed = redditCommentsResponseSchema.safeParse(raw);
  if (!parsed.success) return [];
  const [, commentListing] = parsed.data;
  const projected: ProjectedComment[] = [];
  for (const child of commentListing.data.children) {
    if (child.kind !== "t1") continue;
    const data = redditCommentDataSchema.safeParse(child.data);
    if (!data.success) continue;
    projected.push(projectComment(data.data));
  }
  projected.sort((a, b) => b.score - a.score);
  return projected.slice(0, TOP_COMMENTS_LIMIT);
}

export async function scrapeReddit(
  options: ScrapeOptions,
  client: RedditClient = defaultClient(),
): Promise<RedditScrape> {
  const { subreddit, timeframe, limit, withComments = true } = options;

  const listing = parseListing(
    await client.fetchListing({ subreddit, timeframe, limit }),
  );
  const items: ProjectedPost[] = listing.data.children.map((c) =>
    projectPost(c.data),
  );

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
