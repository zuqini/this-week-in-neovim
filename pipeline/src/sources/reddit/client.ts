export type Timeframe = "day" | "week" | "month";

export interface FetchListingArgs {
  subreddit: string;
  timeframe: Timeframe;
  limit: number;
}

export interface FetchCommentsOpts {
  limit?: number;
  depth?: number;
}

export interface RedditClient {
  fetchListing(args: FetchListingArgs): Promise<unknown>;
  fetchComments(permalink: string, opts?: FetchCommentsOpts): Promise<unknown>;
}

export interface DefaultClientOpts {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

export const DEFAULT_USER_AGENT =
  "this-week-in-neovim/0.1 (https://github.com/zuqini/this-week-in-neovim)";

const RATE_LIMIT_GAP_MS = 1000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000, 4000];

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function defaultClient(opts: DefaultClientOpts = {}): RedditClient {
  const fetchImpl = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

  let lastCallAt: number | null = null;

  async function request(url: URL): Promise<unknown> {
    if (lastCallAt !== null) {
      const elapsed = Date.now() - lastCallAt;
      const wait = RATE_LIMIT_GAP_MS - elapsed;
      if (wait > 0) {
        await sleep(wait);
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const response = await fetchImpl(url.toString(), {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
      });
      lastCallAt = Date.now();

      if (response.ok) {
        return (await response.json()) as unknown;
      }

      const status = response.status;
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;

      if (status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
        const wait = retryAfter ?? BACKOFF_MS[attempt];
        if (isLastAttempt) {
          lastError = await buildHttpError(response, status);
          break;
        }
        await sleep(wait);
        continue;
      }

      if (status >= 500 && status < 600) {
        if (isLastAttempt) {
          lastError = await buildHttpError(response, status);
          break;
        }
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }

      throw await buildHttpError(response, status);
    }

    throw lastError;
  }

  return {
    async fetchListing({ subreddit, timeframe, limit }) {
      const url = new URL(`https://www.reddit.com/r/${subreddit}/top.json`);
      url.search = new URLSearchParams({
        t: timeframe,
        limit: String(limit),
        raw_json: "1",
      }).toString();
      return request(url);
    },

    async fetchComments(permalink, commentsOpts = {}) {
      const limit = commentsOpts.limit ?? 20;
      const depth = commentsOpts.depth ?? 1;
      const url = new URL(`https://www.reddit.com${permalink}.json`);
      url.search = new URLSearchParams({
        limit: String(limit),
        depth: String(depth),
        raw_json: "1",
      }).toString();
      return request(url);
    },
  };
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

async function buildHttpError(response: Response, status: number): Promise<Error> {
  let bodyExcerpt = "";
  try {
    const text = await response.text();
    bodyExcerpt = text.slice(0, 200);
  } catch {
    bodyExcerpt = "<unreadable>";
  }
  return new Error(`Reddit request failed: ${status} — ${bodyExcerpt}`);
}
