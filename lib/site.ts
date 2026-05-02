export const SITE = {
  name: "This Week in Neovim",
  shortName: "TWiN",
  description:
    "A weekly roundup of new and updated Neovim plugins, ecosystem news, and notable community posts.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://thisweekinneovim.org",
  author: "This Week in Neovim",
  locale: "en-US",
  twitter: undefined as string | undefined,
  github: "https://github.com/zuqini/this-week-in-neovim",
} as const;

export function absoluteUrl(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE.url.replace(/\/$/, "")}${p}`;
}
