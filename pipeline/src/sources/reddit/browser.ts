import { chromium, type Browser } from "playwright-core";

export const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

// A static same-origin document: the SPA home page re-navigates and destroys the evaluate context.
const REDDIT_ANCHOR_URL = "https://www.reddit.com/robots.txt";
const LAUNCH_HINT = "start it with `pnpm pipeline:chrome` and sign the profile into Reddit";

export interface BrowserFetchSession {
  fetch: typeof fetch;
  close(): Promise<void>;
}

export interface OpenBrowserFetchOpts {
  connect?: (cdpUrl: string) => Promise<Browser>;
}

interface PageResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

// Runs inside the reddit.com tab, so the request carries the profile's own session cookies.
async function inPageFetch(url: string): Promise<PageResponse> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
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

  const page = await context.newPage();
  try {
    await page.goto(REDDIT_ANCHOR_URL, { waitUntil: "domcontentloaded" });
  } catch (err) {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }

  const browserFetch = async (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    const res = await page.evaluate(inPageFetch, url);
    const contentType = new Headers(res.headers).get("content-type") ?? "";
    if (res.status === 200 && !contentType.includes("json")) {
      throw new Error(
        `Reddit served ${contentType || "a non-JSON page"} for ${url} — the profile may be signed out or challenged; open the Chrome window and check`,
      );
    }
    return new Response(res.body, { status: res.status, headers: res.headers });
  };

  return {
    fetch: browserFetch as typeof fetch,
    // On a CDP-attached browser, close() only disconnects; the user's Chrome keeps running.
    async close() {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
