import { DEFAULT_USER_AGENT } from "../http.js";

export interface CheckUrlsOpts {
  fetch?: typeof fetch;
  userAgent?: string;
  concurrency?: number;
  retryAfterCapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface UrlCheckResult {
  url: string;
  ok: boolean;
  status?: number;
  method?: "HEAD" | "GET";
  error?: string;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_RETRY_AFTER_CAP_MS = 30_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type RequestOutcome =
  | { ok: true; status: number }
  | { ok: false; kind: "http"; status: number }
  | { ok: false; kind: "retry-after"; status: number; delayMs: number }
  | { ok: false; kind: "network"; error: string };

export async function checkUrls(
  urls: string[],
  opts: CheckUrlsOpts = {},
): Promise<UrlCheckResult[]> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const fetchImpl = opts.fetch ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const retryAfterCapMs = opts.retryAfterCapMs ?? DEFAULT_RETRY_AFTER_CAP_MS;
  const sleep = opts.sleep ?? defaultSleep;

  async function tryRequest(
    url: string,
    method: "HEAD" | "GET",
  ): Promise<RequestOutcome> {
    try {
      const res = await fetchImpl(url, {
        method,
        headers: { "User-Agent": userAgent, Accept: "*/*" },
        redirect: "follow",
      });
      if (res.ok) return { ok: true, status: res.status };
      if (res.status === 429) {
        const ra = parseRetryAfter(res.headers.get("Retry-After"));
        if (ra !== null) {
          return { ok: false, kind: "retry-after", status: 429, delayMs: ra };
        }
      }
      return { ok: false, kind: "http", status: res.status };
    } catch (err) {
      return {
        ok: false,
        kind: "network",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function attempt(
    url: string,
    method: "HEAD" | "GET",
  ): Promise<RequestOutcome> {
    const first = await tryRequest(url, method);
    if (first.ok || first.kind !== "retry-after") return first;
    await sleep(Math.min(first.delayMs, retryAfterCapMs));
    return tryRequest(url, method);
  }

  async function checkOne(url: string): Promise<UrlCheckResult> {
    const head = await attempt(url, "HEAD");
    if (head.ok) return { url, ok: true, status: head.status, method: "HEAD" };
    const get = await attempt(url, "GET");
    if (get.ok) return { url, ok: true, status: get.status, method: "GET" };
    if (get.kind === "network") {
      return { url, ok: false, error: get.error, method: "GET" };
    }
    return { url, ok: false, status: get.status, method: "GET" };
  }

  const results: UrlCheckResult[] = new Array(urls.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= urls.length) return;
      results[idx] = await checkOne(urls[idx]);
    }
  }

  const workerCount = Math.min(concurrency, urls.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}
