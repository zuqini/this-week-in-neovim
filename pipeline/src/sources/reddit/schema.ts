import { z } from "zod";

export const redditPostDataSchema = z
  .object({
    title: z.string(),
    author: z.string(),
    permalink: z.string(),
    url: z.string(),
    is_self: z.boolean(),
    selftext: z.string(),
    link_flair_text: z.string().nullable(),
    score: z.number(),
    upvote_ratio: z.number(),
    num_comments: z.number(),
    created_utc: z.number(),
    id: z.string(),
  })
  .passthrough();

export type RedditPostData = z.infer<typeof redditPostDataSchema>;

export const redditCommentDataSchema = z
  .object({
    id: z.string(),
    author: z.string(),
    score: z.number(),
    body: z.string(),
    created_utc: z.number(),
  })
  .passthrough();

export type RedditCommentData = z.infer<typeof redditCommentDataSchema>;

const redditListingDataSchema = <T extends z.ZodTypeAny>(child: T) =>
  z
    .object({
      children: z.array(child),
      after: z.string().nullable().optional(),
      before: z.string().nullable().optional(),
    })
    .passthrough();

const redditListingSchema = <T extends z.ZodTypeAny>(child: T) =>
  z
    .object({
      kind: z.literal("Listing"),
      data: redditListingDataSchema(child),
    })
    .passthrough();

export const redditPostListingSchema = redditListingSchema(
  z
    .object({
      kind: z.literal("t3"),
      data: redditPostDataSchema,
    })
    .passthrough(),
);

export type RedditPostListing = z.infer<typeof redditPostListingSchema>;

const redditCommentChildSchema = z
  .object({
    kind: z.string(),
    data: z.unknown(),
  })
  .passthrough();

export const redditCommentListingSchema = redditListingSchema(redditCommentChildSchema);

export const redditCommentsResponseSchema = z.tuple([
  z.unknown(),
  redditCommentListingSchema,
]);
