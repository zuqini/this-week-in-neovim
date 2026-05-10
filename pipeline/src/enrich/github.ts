import { DEFAULT_USER_AGENT } from "../http.js";

export interface FetchReadmeArgs {
  owner: string;
  repo: string;
  ref?: string;
}

export interface ReadmeResult {
  content: string;
  source: "github-readme";
  url: string;
}

export interface FetchReadmeOpts {
  fetch?: typeof fetch;
  userAgent?: string;
  maxBytes?: number;
}

const README_FILENAMES = ["README.md", "readme.md", "README.MD", "README"];
const DEFAULT_MAX_BYTES = 8 * 1024;

export async function fetchReadme(
  args: FetchReadmeArgs,
  opts: FetchReadmeOpts = {},
): Promise<ReadmeResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const ref = args.ref ?? "HEAD";

  let lastStatus = 0;
  let lastUrl = "";

  for (const filename of README_FILENAMES) {
    const url = `https://raw.githubusercontent.com/${args.owner}/${args.repo}/${ref}/${filename}`;
    const response = await fetchImpl(url, {
      headers: { "User-Agent": userAgent, Accept: "text/plain, text/markdown, */*" },
    });

    if (response.ok) {
      const body = await response.text();
      return {
        content: truncateAtHeader(body, maxBytes),
        source: "github-readme",
        url,
      };
    }

    lastStatus = response.status;
    lastUrl = url;

    if (response.status !== 404) {
      throw new Error(
        `GitHub README fetch failed: ${response.status} for ${url}`,
      );
    }
  }

  throw new Error(
    `GitHub README not found for ${args.owner}/${args.repo} (ref=${ref}); last attempt: ${lastUrl} → ${lastStatus}`,
  );
}

function truncateAtHeader(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) {
    return content;
  }

  const sliced = sliceToBytes(content, maxBytes);
  const lastHeader = sliced.lastIndexOf("\n#");
  if (lastHeader > maxBytes / 2) {
    return sliced.slice(0, lastHeader).trimEnd();
  }
  return sliced.trimEnd();
}

function sliceToBytes(content: string, maxBytes: number): string {
  let lo = 0;
  let hi = content.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (Buffer.byteLength(content.slice(0, mid), "utf8") <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return content.slice(0, lo);
}
