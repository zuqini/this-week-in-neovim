import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  projectComment,
  projectPost,
  scrapeReddit,
} from "@/pipeline/src/sources/reddit/scrape";
import {
  redditCommentDataSchema,
  redditPostDataSchema,
} from "@/pipeline/src/sources/reddit/schema";
import type { RedditClient } from "@/pipeline/src/sources/reddit/client";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "../fixtures/reddit");

async function loadJson<T = unknown>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(FIXTURE_DIR, name), "utf8")) as T;
}

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

function commentsListing(
  children: { kind: string; data: Record<string, unknown> }[],
): unknown {
  return [
    { kind: "Listing", data: { children: [] } },
    { kind: "Listing", data: { children } },
  ];
}

describe("projectPost", () => {
  it("picks only the 12 documented fields and absolutizes permalink", async () => {
    const fixture = (await loadJson("listing-top-week.json")) as {
      data: { children: { data: unknown }[] };
    };
    const raw = redditPostDataSchema.parse(fixture.data.children[0].data);
    const projected = projectPost(raw);

    expect(Object.keys(projected).sort()).toEqual([...POST_FIELDS].sort());
    expect(projected.permalink).toBe(`https://www.reddit.com${raw.permalink}`);
    expect(projected.permalink.startsWith("https://www.reddit.com/r/")).toBe(true);
    expect(projected.title).toBe(raw.title);
    expect(projected.id).toBe(raw.id);
    const bag = projected as unknown as Record<string, unknown>;
    expect(bag.preview).toBeUndefined();
    expect(bag.thumbnail).toBeUndefined();
    expect(bag.author_fullname).toBeUndefined();
  });
});

describe("projectComment", () => {
  it("picks only the 5 documented fields", () => {
    const raw = redditCommentDataSchema.parse({
      id: "c1",
      author: "alice",
      score: 42,
      body: "hello",
      created_utc: 1_700_000_000,
      replies: "",
      author_fullname: "t2_xxx",
      ups: 42,
    });
    const projected = projectComment(raw);
    expect(Object.keys(projected).sort()).toEqual([...COMMENT_FIELDS].sort());
    expect(projected).toEqual({
      id: "c1",
      author: "alice",
      score: 42,
      body: "hello",
      created_utc: 1_700_000_000,
    });
  });
});

describe("scrapeReddit", () => {
  it("returns provenance envelope with source/subreddit/fetchedAt/params/items", async () => {
    const listing = await loadJson("listing-top-week.json");
    const client: RedditClient = {
      fetchListing: vi.fn().mockResolvedValue(listing),
      fetchComments: vi.fn().mockResolvedValue(commentsListing([])),
    };

    const before = Date.now();
    const result = await scrapeReddit(
      { subreddit: "neovim", timeframe: "week", limit: 50, withComments: false },
      client,
    );
    const after = Date.now();

    expect(result.source).toBe("reddit");
    expect(result.subreddit).toBe("neovim");
    expect(result.params).toEqual({
      subreddit: "neovim",
      timeframe: "week",
      limit: 50,
      withComments: false,
    });
    expect(result.items).toHaveLength(50);
    const ts = Date.parse(result.fetchedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("calls fetchListing with the supplied options", async () => {
    const listing = await loadJson("listing-top-week.json");
    const fetchListing = vi.fn().mockResolvedValue(listing);
    const client: RedditClient = {
      fetchListing,
      fetchComments: vi.fn().mockResolvedValue(commentsListing([])),
    };

    await scrapeReddit(
      { subreddit: "neovim", timeframe: "day", limit: 5, withComments: false },
      client,
    );

    expect(fetchListing).toHaveBeenCalledTimes(1);
    expect(fetchListing).toHaveBeenCalledWith({
      subreddit: "neovim",
      timeframe: "day",
      limit: 5,
    });
  });

  it("skips comment fetches when withComments=false", async () => {
    const listing = await loadJson("listing-top-week.json");
    const fetchComments = vi.fn().mockResolvedValue(commentsListing([]));
    const client: RedditClient = {
      fetchListing: vi.fn().mockResolvedValue(listing),
      fetchComments,
    };

    const result = await scrapeReddit(
      { subreddit: "neovim", timeframe: "week", limit: 50, withComments: false },
      client,
    );

    expect(fetchComments).not.toHaveBeenCalled();
    for (const p of result.items) {
      expect(p.top_comments).toBeUndefined();
    }
  });

  it("fetches comments per post and projects top 5 by score, filtering 'more' stubs", async () => {
    const listing = {
      kind: "Listing",
      data: {
        children: [
          {
            kind: "t3",
            data: {
              title: "t",
              author: "a",
              permalink: "/r/neovim/comments/p1/x/",
              url: "https://example.com/p1",
              is_self: false,
              selftext: "",
              link_flair_text: null,
              score: 100,
              upvote_ratio: 0.95,
              num_comments: 10,
              created_utc: 1,
              id: "p1",
            },
          },
          {
            kind: "t3",
            data: {
              title: "t2",
              author: "a2",
              permalink: "/r/neovim/comments/p2/y/",
              url: "https://example.com/p2",
              is_self: false,
              selftext: "",
              link_flair_text: null,
              score: 50,
              upvote_ratio: 0.9,
              num_comments: 5,
              created_utc: 2,
              id: "p2",
            },
          },
        ],
      },
    };

    const p1Comments = commentsListing([
      { kind: "t1", data: { id: "c1", author: "u1", score: 10, body: "b1", created_utc: 1 } },
      { kind: "t1", data: { id: "c2", author: "u2", score: 30, body: "b2", created_utc: 2 } },
      { kind: "t1", data: { id: "c3", author: "u3", score: 5, body: "b3", created_utc: 3 } },
      { kind: "t1", data: { id: "c4", author: "u4", score: 40, body: "b4", created_utc: 4 } },
      { kind: "t1", data: { id: "c5", author: "u5", score: 20, body: "b5", created_utc: 5 } },
      { kind: "t1", data: { id: "c6", author: "u6", score: 15, body: "b6", created_utc: 6 } },
      { kind: "more", data: { id: "stub", count: 3, children: [] } },
    ]);
    const p2Comments = commentsListing([
      { kind: "t1", data: { id: "x1", author: "ux", score: 7, body: "bx", created_utc: 1 } },
      { kind: "more", data: { id: "stub2", count: 2, children: [] } },
    ]);

    const fetchComments = vi
      .fn()
      .mockResolvedValueOnce(p1Comments)
      .mockResolvedValueOnce(p2Comments);

    const client: RedditClient = {
      fetchListing: vi.fn().mockResolvedValue(listing),
      fetchComments,
    };

    const result = await scrapeReddit(
      { subreddit: "neovim", timeframe: "week", limit: 2 },
      client,
    );

    expect(fetchComments).toHaveBeenCalledTimes(2);
    expect(fetchComments).toHaveBeenNthCalledWith(
      1,
      "/r/neovim/comments/p1/x/",
      { limit: 20, depth: 1 },
    );
    expect(fetchComments).toHaveBeenNthCalledWith(
      2,
      "/r/neovim/comments/p2/y/",
      { limit: 20, depth: 1 },
    );

    expect(result.items[0].top_comments).toHaveLength(5);
    expect(result.items[0].top_comments!.map((c) => c.id)).toEqual([
      "c4",
      "c2",
      "c5",
      "c6",
      "c1",
    ]);
    for (const c of result.items[0].top_comments!) {
      expect(Object.keys(c).sort()).toEqual([...COMMENT_FIELDS].sort());
    }

    expect(result.items[1].top_comments).toHaveLength(1);
    expect(result.items[1].top_comments![0].id).toBe("x1");
  });

  it("throws with a path-prefixed schema error when a post is missing required fields", async () => {
    const fixture = (await loadJson("listing-top-week.json")) as {
      data: { children: { data: Record<string, unknown> }[] };
    };
    delete fixture.data.children[0].data.title;
    const client: RedditClient = {
      fetchListing: vi.fn().mockResolvedValue(fixture),
      fetchComments: vi.fn().mockResolvedValue(commentsListing([])),
    };

    await expect(
      scrapeReddit(
        { subreddit: "neovim", timeframe: "week", limit: 50, withComments: false },
        client,
      ),
    ).rejects.toThrow(/reddit listing schema mismatch at data\.children\.0\.data\.title/);
  });

  it("returns no top_comments when the comments response has the wrong outer shape", async () => {
    const listing = await loadJson("listing-top-week.json");
    const client: RedditClient = {
      fetchListing: vi.fn().mockResolvedValue(listing),
      fetchComments: vi.fn().mockResolvedValue({ not: "an array" }),
    };

    const result = await scrapeReddit(
      { subreddit: "neovim", timeframe: "week", limit: 5 },
      client,
    );
    for (const p of result.items) {
      expect(p.top_comments).toEqual([]);
    }
  });
});
