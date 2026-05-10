import { DEFAULT_USER_AGENT } from "../../http.js";
import type { RawScrapePayload, ScrapeItem } from "../../types.js";

export interface GithubRelease extends ScrapeItem {
  id: string;
  url: string;
  title: string;
  tag_name: string;
  body: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
}

export interface FetchReleasesArgs {
  owner: string;
  repo: string;
  since?: string;
  perPage?: number;
}

export interface FetchReleasesOpts {
  fetch?: typeof fetch;
  userAgent?: string;
  token?: string;
}

export interface GithubReleasesScrape extends RawScrapePayload<GithubRelease> {
  source: "github-releases";
}

const DEFAULT_PER_PAGE = 30;

export async function scrapeReleases(
  args: FetchReleasesArgs,
  opts: FetchReleasesOpts = {},
): Promise<GithubReleasesScrape> {
  const fetchImpl = opts.fetch ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const perPage = args.perPage ?? DEFAULT_PER_PAGE;

  const url = new URL(
    `https://api.github.com/repos/${args.owner}/${args.repo}/releases`,
  );
  url.searchParams.set("per_page", String(perPage));

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const response = await fetchImpl(url.toString(), { headers });

  if (response.status === 401 || response.status === 403) {
    const detail = await safeText(response);
    throw new Error(
      `GitHub releases auth failed: ${response.status}. Set GITHUB_TOKEN to raise rate limits or fix permissions. ${detail}`,
    );
  }
  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(`GitHub releases fetch failed: ${response.status} ${detail}`);
  }

  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("GitHub releases: expected JSON array");
  }

  const sinceMs = args.since ? Date.parse(args.since) : null;
  const items: GithubRelease[] = [];
  for (const r of raw) {
    const rel = projectRelease(r);
    if (rel === null) continue;
    if (sinceMs !== null && Date.parse(rel.published_at) < sinceMs) continue;
    items.push(rel);
  }

  return {
    source: "github-releases",
    fetchedAt: new Date().toISOString(),
    params: {
      owner: args.owner,
      repo: args.repo,
      since: args.since ?? null,
      perPage,
    },
    items,
  };
}

export function projectRelease(raw: unknown): GithubRelease | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tag_name = stringOrNull(r.tag_name);
  const html_url = stringOrNull(r.html_url);
  const published_at = stringOrNull(r.published_at);
  if (tag_name === null || html_url === null || published_at === null) return null;
  const name = stringOrNull(r.name);
  return {
    id: tag_name,
    url: html_url,
    title: name && name.length > 0 ? name : tag_name,
    tag_name,
    body: typeof r.body === "string" ? r.body : "",
    published_at,
    draft: r.draft === true,
    prerelease: r.prerelease === true,
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

export function defaultSinceIso(now: Date = new Date(), days = 7): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
