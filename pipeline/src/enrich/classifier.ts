export type LinkKind =
  | { kind: "github-readme"; owner: string; repo: string; ref?: string }
  | { kind: "html-article"; url: string }
  | { kind: "video"; url: string }
  | { kind: "reddit-self"; url: string }
  | { kind: "unknown"; url: string };

const VIDEO_HOSTS = new Set([
  "v.redd.it",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
]);

const REDDIT_HOSTS = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "new.reddit.com",
  "np.reddit.com",
]);

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

const GITHUB_NON_REPO_PATHS = new Set([
  "topics",
  "trending",
  "marketplace",
  "settings",
  "explore",
  "notifications",
  "issues",
  "pulls",
  "search",
  "about",
  "features",
  "pricing",
  "login",
  "signup",
  "orgs",
  "sponsors",
]);

export function classify(rawUrl: string): LinkKind {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "unknown", url: rawUrl };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "unknown", url: rawUrl };
  }

  const host = url.hostname.toLowerCase();

  if (VIDEO_HOSTS.has(host)) {
    return { kind: "video", url: rawUrl };
  }

  if (REDDIT_HOSTS.has(host)) {
    return { kind: "reddit-self", url: rawUrl };
  }

  if (GITHUB_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const [owner, repo, maybeTree, ...refParts] = segments;
      if (!GITHUB_NON_REPO_PATHS.has(owner.toLowerCase())) {
        const cleanRepo = repo.replace(/\.git$/i, "");
        if (maybeTree === "tree" && refParts.length > 0) {
          return {
            kind: "github-readme",
            owner,
            repo: cleanRepo,
            ref: refParts.join("/"),
          };
        }
        return { kind: "github-readme", owner, repo: cleanRepo };
      }
    }
  }

  return { kind: "html-article", url: rawUrl };
}
