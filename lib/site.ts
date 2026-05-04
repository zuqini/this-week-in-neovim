const RAW_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://thisweekinneovim.org";

let parsedSiteUrl: URL;
try {
  parsedSiteUrl = new URL(RAW_SITE_URL);
} catch (err) {
  throw new Error(
    `NEXT_PUBLIC_SITE_URL is not a valid absolute URL (got ${JSON.stringify(RAW_SITE_URL)}). It must include a scheme, e.g. https://example.com.`,
    { cause: err },
  );
}

export const SITE = {
  name: "This Week in Neovim",
  shortName: "TWiN",
  description:
    "A weekly roundup of new and updated Neovim plugins, ecosystem news, and notable community posts.",
  url: RAW_SITE_URL,
  author: "This Week in Neovim",
  github: "https://github.com/zuqini/this-week-in-neovim",
} as const;

export const SITE_HOST = parsedSiteUrl.host;

export function absoluteUrl(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE.url.replace(/\/$/, "")}${p}`;
}

export function issueHref(slug: string): string {
  return `/issues/${slug}/`;
}

export function siteHost(): string {
  return SITE_HOST;
}
