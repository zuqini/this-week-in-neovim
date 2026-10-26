#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { captureOutput } from "../src/capture.js";
import { runCli as evalDraftCli } from "./eval-draft.js";

export type Exec = (
  cmd: "git" | "gh",
  args: string[],
  opts?: { maxBuffer?: number },
) => Promise<string>;

export interface JudgeDeps {
  exec?: Exec;
  evalDraft?: (argv: string[]) => Promise<number>;
}

export class ExecError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "ExecError";
  }
}

export const MAX_ENRICHED_BYTES = 5 * 1024 * 1024;
export const MAX_OUTPUT_CHARS = 60_000;

const USAGE = "usage: pipeline:judge:pr <pr-number> [--no-comment]";
const SHA_RE = /^[0-9a-f]{40}$/;
const BRANCH_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
const DRAFT_RE = /^content\/issues\/(\d{4}-\d{2}-\d{2})\.mdx$/;
const ENRICHED_PREFIX = "pipeline/data/enriched/";
const ENRICHED_NAME_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.json$/;
const LS_TREE_RE = /^(\d{6}) (\S+) ([0-9a-f]+) +(-|\d+)\t(.*)$/s;
const BLOB_MAX_BUFFER = MAX_ENRICHED_BYTES * 2;

const execFileAsync = promisify(execFile);

const defaultExec: Exec = async (cmd, args, opts = {}) => {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      encoding: "utf8",
      maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { code?: unknown; stderr?: unknown };
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
    throw new ExecError(
      `${cmd} ${args.join(" ")} failed: ${stderr || formatErr(err)}`,
      typeof e.code === "number" ? e.code : null,
    );
  }
};

interface CliArgs {
  pr: number;
  comment: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let pr: string | undefined;
  let comment = true;
  for (const a of argv) {
    if (a === "--") continue;
    if (a === "--no-comment") comment = false;
    else if (a.startsWith("-") || pr !== undefined) throw new Error(USAGE);
    else pr = a;
  }
  if (pr === undefined || !/^[1-9]\d*$/.test(pr)) throw new Error(USAGE);
  return { pr: Number(pr), comment };
}

interface PrInfo {
  headRefOid: string;
  headRefName: string;
  baseRefName: string;
  state: string;
  url: string;
}

interface EnrichedEntry {
  path: string;
  name: string;
}

interface PrFiles {
  draftPath: string;
  draftDate: string;
  enrichedDir: string;
  enriched: EnrichedEntry[];
}

export async function runCli(argv: string[], deps: JudgeDeps = {}): Promise<number> {
  const exec = deps.exec ?? defaultExec;
  const evalDraft = deps.evalDraft ?? evalDraftCli;

  let tmp: string | undefined;
  try {
    const args = parseArgs(argv);
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set; the faithfulness judge needs it");
    }

    const pr = await viewPr(exec, args.pr);
    const sha = await fetchPrHead(exec, args.pr, pr);
    const judgeSha = await guardTrustedCheckout(exec, sha);
    const files = await listPrFiles(exec, pr.baseRefName, sha);

    tmp = await mkdtemp(path.join(os.tmpdir(), "twin-judge-"));
    const mdxPath = path.join(tmp, `${files.draftDate}.mdx`);
    const enrichedTmp = path.join(tmp, "enriched");
    await mkdir(enrichedTmp);
    await writeFile(mdxPath, await readBlob(exec, sha, files.draftPath), "utf8");
    for (const entry of files.enriched) {
      await writeFile(path.join(enrichedTmp, entry.name), await readBlob(exec, sha, entry.path), "utf8");
    }

    const captured = await captureOutput(() =>
      evalDraft([mdxPath, "--skip-links", "--faithfulness", "--enriched-dir", enrichedTmp]),
    );
    const passed = captured.value === 0;
    const body = renderComment({
      passed,
      sha,
      judgeSha,
      files,
      output: captured.stdout + captured.stderr,
    });

    if (args.comment) {
      const bodyFile = path.join(tmp, "comment.md");
      await writeFile(bodyFile, body, "utf8");
      await exec("gh", ["pr", "comment", String(args.pr), "--body-file", bodyFile]);
      process.stdout.write(
        `judge-pr: posted faithfulness ${passed ? "PASS" : "FAIL"} to ${pr.url}\n`,
      );
    } else {
      process.stdout.write(body);
    }
    return passed ? 0 : 1;
  } catch (err) {
    process.stderr.write(`judge-pr: ${formatErr(err)}\n`);
    return 2;
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }
}

async function viewPr(exec: Exec, n: number): Promise<PrInfo> {
  const raw = await exec("gh", [
    "pr",
    "view",
    String(n),
    "--json",
    "headRefOid,headRefName,baseRefName,state,url",
  ]);
  const info = JSON.parse(raw) as Partial<PrInfo>;
  if (info.state !== "OPEN") {
    throw new Error(`PR #${n} is ${info.state ?? "in an unknown state"}, not OPEN`);
  }
  if (typeof info.headRefName !== "string" || !info.headRefName.startsWith("weekly/")) {
    throw new Error(
      `PR #${n} head branch ${JSON.stringify(info.headRefName)} is not weekly/<date>; the judge only runs on weekly issue PRs`,
    );
  }
  if (typeof info.headRefOid !== "string" || !SHA_RE.test(info.headRefOid)) {
    throw new Error(`PR #${n} has an unexpected headRefOid ${JSON.stringify(info.headRefOid)}`);
  }
  if (typeof info.baseRefName !== "string" || !BRANCH_RE.test(info.baseRefName)) {
    throw new Error(`PR #${n} has an unexpected baseRefName ${JSON.stringify(info.baseRefName)}`);
  }
  return {
    headRefOid: info.headRefOid,
    headRefName: info.headRefName,
    baseRefName: info.baseRefName,
    state: info.state,
    url: typeof info.url === "string" ? info.url : `PR #${n}`,
  };
}

async function fetchPrHead(exec: Exec, n: number, pr: PrInfo): Promise<string> {
  await exec("git", ["fetch", "--no-tags", "origin", pr.baseRefName]);
  await exec("git", ["fetch", "--no-tags", "origin", `refs/pull/${n}/head`]);
  const fetched = (await exec("git", ["rev-parse", "FETCH_HEAD"])).trim();
  if (fetched !== pr.headRefOid) {
    throw new Error(
      `PR head moved; re-run (gh says ${pr.headRefOid}, fetched ${fetched})`,
    );
  }
  return fetched;
}

async function guardTrustedCheckout(exec: Exec, sha: string): Promise<string> {
  let isAncestor: boolean;
  try {
    await exec("git", ["merge-base", "--is-ancestor", sha, "HEAD"]);
    isAncestor = true;
  } catch (err) {
    if (!(err instanceof ExecError && err.exitCode === 1)) throw err;
    isAncestor = false;
  }
  if (isAncestor) {
    throw new Error(
      `PR head ${sha} is already in HEAD; the judge must run from a checkout without the PR's commits (e.g. main)`,
    );
  }
  return (await exec("git", ["rev-parse", "HEAD"])).trim();
}

async function listPrFiles(exec: Exec, base: string, sha: string): Promise<PrFiles> {
  const tokens = (
    await exec("git", ["diff", "--name-status", "-z", "--no-renames", `origin/${base}...${sha}`])
  ).split("\0");
  const changes: Array<{ status: string; path: string }> = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    changes.push({ status: tokens[i], path: tokens[i + 1] });
  }

  const drafts = changes
    .filter((c) => (c.status === "A" || c.status === "M") && DRAFT_RE.test(c.path))
    .map((c) => c.path);
  if (drafts.length !== 1) {
    throw new Error(
      `expected exactly one changed content/issues/<YYYY-MM-DD>.mdx, found ${drafts.length}${drafts.length > 0 ? `: ${drafts.join(", ")}` : ""}`,
    );
  }
  const draftPath = drafts[0];
  const draftDate = draftPath.match(DRAFT_RE)![1];
  const enrichedDir = `${ENRICHED_PREFIX}${draftDate}/`;

  const enrichedChanges = changes.filter((c) => c.path.startsWith(ENRICHED_PREFIX));
  if (enrichedChanges.length === 0) {
    throw new Error(`the PR adds nothing under ${enrichedDir}`);
  }
  for (const c of enrichedChanges) {
    if (!c.path.startsWith(enrichedDir)) {
      throw new Error(
        `enriched change ${JSON.stringify(c.path)} is outside ${enrichedDir}; evidence must sit under the draft's date`,
      );
    }
    if (c.status !== "A") {
      throw new Error(
        `enriched file ${JSON.stringify(c.path)} has diff status ${c.status}; a weekly PR may only add evidence`,
      );
    }
  }
  const onBase = await exec("git", ["ls-tree", `origin/${base}`, "--", enrichedDir]);
  if (onBase.trim() !== "") {
    throw new Error(`${enrichedDir} already exists on origin/${base}; a weekly PR must add fresh evidence`);
  }

  const listing = (await exec("git", ["ls-tree", "-l", "-z", sha, "--", enrichedDir]))
    .split("\0")
    .filter((l) => l !== "");
  const enriched: EnrichedEntry[] = [];
  let totalBytes = 0;
  for (const line of listing) {
    const m = line.match(LS_TREE_RE);
    if (!m) throw new Error(`cannot parse git ls-tree line ${JSON.stringify(line)}`);
    const [, mode, type, , size, entryPath] = m;
    const name = entryPath.slice(enrichedDir.length);
    if (
      mode !== "100644" ||
      type !== "blob" ||
      !entryPath.startsWith(enrichedDir) ||
      !ENRICHED_NAME_RE.test(name)
    ) {
      throw new Error(
        `refusing enriched entry ${JSON.stringify(entryPath)} (mode ${mode} ${type}); only plain *.json files are allowed`,
      );
    }
    totalBytes += Number(size);
    enriched.push({ path: entryPath, name });
  }
  if (enriched.length === 0) throw new Error(`no files in ${enrichedDir} at ${sha}`);
  if (totalBytes > MAX_ENRICHED_BYTES) {
    throw new Error(
      `${enrichedDir} is ${totalBytes} bytes, over the ${MAX_ENRICHED_BYTES}-byte cap`,
    );
  }

  return { draftPath, draftDate, enrichedDir, enriched };
}

function readBlob(exec: Exec, sha: string, repoPath: string): Promise<string> {
  return exec("git", ["cat-file", "blob", `${sha}:${repoPath}`], { maxBuffer: BLOB_MAX_BUFFER });
}

function renderComment(r: {
  passed: boolean;
  sha: string;
  judgeSha: string;
  files: PrFiles;
  output: string;
}): string {
  const overflow = r.output.length - MAX_OUTPUT_CHARS;
  const kept = overflow > 0 ? `${r.output.slice(0, MAX_OUTPUT_CHARS)}\n… truncated ${overflow} chars` : r.output;
  const output = kept.endsWith("\n") || kept === "" ? kept : `${kept}\n`;
  const longestRun = Math.max(0, ...(output.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  const n = r.files.enriched.length;
  return [
    `### Faithfulness judge: ${r.passed ? "PASS" : "FAIL"}`,
    "",
    `- PR head: \`${r.sha}\``,
    `- Draft: \`${r.files.draftPath}\``,
    `- Enriched: \`${r.files.enrichedDir}\` (${n} file${n === 1 ? "" : "s"})`,
    `- Judge code: \`${r.judgeSha}\``,
    "- Evidence: the draft and enriched JSON come from this PR; their provenance is not independently verified, so human review remains the gate.",
    "",
    `${fence}text`,
    `${output}${fence}`,
    "",
  ].join("\n");
}

function formatErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const isMain = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    const url = new URL(import.meta.url);
    return url.pathname === arg || url.pathname.endsWith(arg);
  } catch {
    return false;
  }
})();

if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`judge-pr: fatal: ${formatErr(err)}\n`);
      process.exit(2);
    },
  );
}
