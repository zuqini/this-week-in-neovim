import { chromium, type Browser, type Page } from "playwright-core";

const DEFAULT_CDP_PORT = "9222";

// A static same-origin document: the SPA home page re-navigates and destroys the evaluate context.
const REDDIT_ANCHOR_URL = "https://www.reddit.com/robots.txt";
const REDDIT_ORIGIN = new URL(REDDIT_ANCHOR_URL).origin;
const LAUNCH_HINT = "start it with `pnpm pipeline:chrome` and sign the profile into Reddit";
const FETCH_TIMEOUT_MS = 30_000;
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export function defaultCdpUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `http://127.0.0.1:${env.TWIN_CDP_PORT || DEFAULT_CDP_PORT}`;
}

export interface BrowserFetchSession {
  fetch: typeof fetch;
  close(): Promise<void>;
}

export interface OpenBrowserFetchOpts {
  connect?: (cdpUrl: string) => Promise<Browser>;
  timeoutMs?: number;
}

interface PageRequest {
  url: string;
  timeoutMs: number;
}

interface PageResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

// Runs inside the reddit.com tab, so the request carries the profile's own session cookies.
async function inPageFetch({ url, timeoutMs }: PageRequest): Promise<PageResponse> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    status: res.status,
    headers: [...res.headers.entries()],
    body: await res.text(),
  };
}

export async function openBrowserFetch(
  cdpUrl: string,
  opts: OpenBrowserFetchOpts = {},
): Promise<BrowserFetchSession> {
  const connect = opts.connect ?? ((url: string) => chromium.connectOverCDP(url));
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  let browser: Browser;
  try {
    browser = await connect(cdpUrl);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new Error(`cannot connect to Chrome at ${cdpUrl} (${reason}); ${LAUNCH_HINT}`);
  }

  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error(`Chrome at ${cdpUrl} exposes no browser context; ${LAUNCH_HINT}`);
  }

  let page: Page | undefined;
  try {
    page = await context.newPage();
    const anchor = await page.goto(REDDIT_ANCHOR_URL, { waitUntil: "domcontentloaded" });
    const landedOn = page.url();
    if ((anchor && !anchor.ok()) || new URL(landedOn).origin !== REDDIT_ORIGIN) {
      throw new Error(
        `opening ${REDDIT_ANCHOR_URL} landed on ${landedOn}${anchor ? ` (HTTP ${anchor.status()})` : ""} — Reddit may be blocking or challenging the profile; open the Chrome window and check`,
      );
    }
  } catch (err) {
    await page?.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }
  const tab = page;

  const browserFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() !== "GET" || init?.body != null) {
      throw new Error(`the Reddit browser transport only supports GET requests (got ${method})`);
    }
    const url = input instanceof Request ? input.url : input.toString();
    const res = await tab.evaluate(inPageFetch, { url, timeoutMs });
    const body = NULL_BODY_STATUSES.has(res.status) ? null : res.body;
    return new Response(body, { status: res.status, headers: res.headers });
  };

  return {
    fetch: browserFetch as typeof fetch,
    // On a CDP-attached browser, close() only disconnects; the user's Chrome keeps running.
    async close() {
      await tab.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
