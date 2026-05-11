import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RawScrapePayload, ScrapeItem } from "../../types.js";

const execFileAsync = promisify(execFile);

export interface AwesomeNeovimAddition extends ScrapeItem {
  id: string;
  url: string;
  title: string;
  description: string;
  addedInCommit: string;
}

export interface ScrapeRepoArgs {
  repoDir: string;
  since: string;
  readme?: string;
}

export interface ScrapeRepoOpts {
  runGit?: (repoDir: string, args: string[]) => Promise<string>;
}

export interface AwesomeNeovimScrape extends RawScrapePayload<AwesomeNeovimAddition> {
  source: "awesome-neovim";
}

const DEFAULT_README = "README.md";

const COMMIT_RE = /^commit ([0-9a-f]{7,40})/;
const FILE_MARKER_RE = /^(\+\+\+|---) /;
const ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)\s]+)\)\s*[-—–:]\s*(.+?)\s*$/;

export function parseAdditions(diff: string): AwesomeNeovimAddition[] {
  const out = new Map<string, AwesomeNeovimAddition>();
  let currentCommit = "";
  let commitAdds: Array<{ name: string; url: string; description: string }> = [];
  let commitRems = new Set<string>();

  function flushCommit(): void {
    for (const add of commitAdds) {
      if (commitRems.has(add.url)) continue;
      if (out.has(add.url)) continue;
      out.set(add.url, {
        id: add.url,
        url: add.url,
        title: add.name,
        description: add.description,
        addedInCommit: currentCommit,
      });
    }
    commitAdds = [];
    commitRems = new Set();
  }

  for (const line of diff.split("\n")) {
    const c = line.match(COMMIT_RE);
    if (c) {
      flushCommit();
      currentCommit = c[1];
      continue;
    }
    if (FILE_MARKER_RE.test(line)) continue;
    if (line.startsWith("+")) {
      const m = line.slice(1).match(ENTRY_RE);
      if (!m) continue;
      const [, name, url, description] = m;
      commitAdds.push({ name, url, description });
    } else if (line.startsWith("-")) {
      const m = line.slice(1).match(ENTRY_RE);
      if (m) commitRems.add(m[2]);
    }
  }
  flushCommit();

  return Array.from(out.values());
}

export async function scrapeRepo(
  args: ScrapeRepoArgs,
  opts: ScrapeRepoOpts = {},
): Promise<AwesomeNeovimScrape> {
  const runGit = opts.runGit ?? defaultRunGit;
  const readme = args.readme ?? DEFAULT_README;
  const stdout = await runGit(args.repoDir, [
    "log",
    "-p",
    "--no-color",
    `--since=${args.since}`,
    "--",
    readme,
  ]);
  const items = parseAdditions(stdout);
  return {
    source: "awesome-neovim",
    fetchedAt: new Date().toISOString(),
    params: {
      repoDir: args.repoDir,
      since: args.since,
      readme,
    },
    items,
  };
}

async function defaultRunGit(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

export async function ensureRepo(
  repoUrl: string,
  repoDir: string,
  opts: { runGit?: (cwd: string, args: string[]) => Promise<string>; exists?: (dir: string) => Promise<boolean> } = {},
): Promise<void> {
  const runGit = opts.runGit ?? defaultRunGit;
  const exists = opts.exists ?? defaultExists;
  if (await exists(repoDir)) {
    await runGit(repoDir, ["fetch", "--quiet", "origin"]);
    await runGit(repoDir, ["reset", "--hard", "origin/HEAD", "--quiet"]);
    return;
  }
  await runGit(".", ["clone", "--quiet", "--filter=blob:none", repoUrl, repoDir]);
}

async function defaultExists(dir: string): Promise<boolean> {
  const { access, constants } = await import("node:fs/promises");
  try {
    await access(dir, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function defaultSinceArg(now: Date = new Date(), days = 7): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
