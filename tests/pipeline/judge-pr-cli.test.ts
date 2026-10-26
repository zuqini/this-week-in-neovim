import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecError, MAX_ENRICHED_BYTES, MAX_OUTPUT_CHARS, runCli, type Exec } from "@/pipeline/bin/judge-pr";

const PR_SHA = "a".repeat(40);
const JUDGE_SHA = "b".repeat(40);
const DRAFT = "content/issues/2026-11-02.mdx";
const ENRICHED_DIR = "pipeline/data/enriched/2026-11-02/";

interface TreeEntry {
  mode: string;
  type: string;
  size: number | "-";
  path: string;
}

interface Scenario {
  pr?: Record<string, unknown>;
  fetchHead?: string;
  isAncestor?: boolean;
  changes?: Array<[status: string, path: string]>;
  enrichedOnBase?: boolean;
  tree?: TreeEntry[];
  blobs?: Record<string, string>;
}

const DEFAULT_BLOBS: Record<string, string> = {
  [DRAFT]: "---\nissue: 2\n---\nBody with ``` fences and ünïcode.\n",
  [`${ENRICHED_DIR}reddit-neovim.json`]: '{"source":"reddit","items":[]}\n',
  [`${ENRICHED_DIR}github-neovim-neovim-releases.json`]: '{"source":"github","items":[]}\n',
};

const ALLOWED_GIT = new Set(["fetch", "rev-parse", "merge-base", "diff", "ls-tree", "cat-file"]);

function blobEntries(blobs: Record<string, string>): TreeEntry[] {
  return Object.entries(blobs)
    .filter(([p]) => p.startsWith(ENRICHED_DIR))
    .map(([p, content]) => ({
      mode: "100644",
      type: "blob",
      size: Buffer.byteLength(content),
      path: p,
    }));
}

function fakeExec(s: Scenario = {}) {
  const blobs = s.blobs ?? DEFAULT_BLOBS;
  const tree = s.tree ?? blobEntries(blobs);
  const changes = s.changes ?? Object.keys(blobs).map((p): [string, string] => ["A", p]);
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const comments: string[] = [];

  const exec: Exec = async (cmd, args) => {
    calls.push({ cmd, args });
    const key = `${cmd} ${args.join(" ")}`;
    if (key === "gh pr view 7 --json headRefOid,headRefName,baseRefName,state,url") {
      return JSON.stringify({
        headRefOid: PR_SHA,
        headRefName: "weekly/2026-11-02",
        baseRefName: "main",
        state: "OPEN",
        url: "https://github.com/zuqini/this-week-in-neovim/pull/7",
        ...s.pr,
      });
    }
    if (key === "git fetch --no-tags origin main") return "";
    if (key === "git fetch --no-tags origin refs/pull/7/head") return "";
    if (key === "git rev-parse FETCH_HEAD") return `${s.fetchHead ?? PR_SHA}\n`;
    if (key === `git merge-base --is-ancestor ${PR_SHA} HEAD`) {
      if (s.isAncestor) return "";
      throw new ExecError("not an ancestor", 1);
    }
    if (key === "git rev-parse HEAD") return `${JUDGE_SHA}\n`;
    if (key === `git diff --name-status -z --no-renames origin/main...${PR_SHA}`) {
      return changes.map(([status, p]) => `${status}\0${p}\0`).join("");
    }
    if (key === `git ls-tree origin/main -- ${ENRICHED_DIR}`) {
      return s.enrichedOnBase ? `100644 blob ${"e".repeat(40)}\t${ENRICHED_DIR}old.json\n` : "";
    }
    if (key === `git ls-tree -l -z ${PR_SHA} -- ${ENRICHED_DIR}`) {
      return tree
        .map((e) => `${e.mode} ${e.type} ${"c".repeat(40)} ${String(e.size).padStart(7)}\t${e.path}\0`)
        .join("");
    }
    if (cmd === "git" && args[0] === "cat-file" && args[1] === "blob") {
      const p = args[2].slice(`${PR_SHA}:`.length);
      if (!args[2].startsWith(`${PR_SHA}:`) || !(p in blobs)) throw new ExecError(`no blob ${args[2]}`, 128);
      return blobs[p];
    }
    if (cmd === "gh" && args[0] === "pr" && args[1] === "comment" && args[2] === "7" && args[3] === "--body-file") {
      comments.push(readFileSync(args[4], "utf8"));
      return "";
    }
    throw new Error(`unexpected exec: ${key}`);
  };

  return { exec, calls, comments };
}

describe("judge-pr CLI", () => {
  let stdout: string;
  let stderr: string;
  let evalArgv: string[] | undefined;
  let evalFiles: Record<string, string>;

  const passingEval = vi.fn(async (argv: string[]) => {
    evalArgv = argv;
    evalFiles = { mdx: readFileSync(argv[0], "utf8") };
    const dir = argv[argv.indexOf("--enriched-dir") + 1];
    for (const name of ["reddit-neovim.json", "github-neovim-neovim-releases.json"]) {
      const file = path.join(dir, name);
      if (existsSync(file)) evalFiles[name] = readFileSync(file, "utf8");
    }
    process.stdout.write("eval-draft: ok (citations: ok, words: 500 in [100, 10000], links: skipped, faithfulness: 4 ok)\n");
    process.stderr.write("faithfulness usage: input=1, output=2, cache_read=0, cache_creation=0\n");
    return 0;
  });

  beforeEach(() => {
    stdout = "";
    stderr = "";
    evalArgv = undefined;
    evalFiles = {};
    passingEval.mockClear();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([[[]], [["0"]], [["-3"]], [["7x"]], [["7", "8"]], [["7", "--bogus"]]])(
    "rejects bad arguments %j with exit 2 before running anything",
    async (argv) => {
      const fake = fakeExec();
      expect(await runCli(argv, { exec: fake.exec, evalDraft: passingEval })).toBe(2);
      expect(fake.calls).toEqual([]);
      expect(stderr).toContain("usage: pipeline:judge:pr <pr-number> [--no-comment]");
    },
  );

  it("exits 2 without ANTHROPIC_API_KEY", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fake = fakeExec();
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(fake.calls).toEqual([]);
    expect(stderr).toContain("ANTHROPIC_API_KEY");
  });

  it("exits 2 when the PR is not open", async () => {
    const fake = fakeExec({ pr: { state: "MERGED" } });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("MERGED, not OPEN");
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("exits 2 before fetching anything when the PR's head branch isn't weekly/*", async () => {
    const fake = fakeExec({ pr: { headRefName: "feature/sneaky" } });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain('head branch "feature/sneaky" is not weekly/<date>');
    expect(fake.calls.map((c) => c.cmd)).toEqual(["gh"]);
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("exits 2 when the fetched head differs from gh's headRefOid", async () => {
    const fake = fakeExec({ fetchHead: "d".repeat(40) });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("PR head moved; re-run");
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("refuses to run when the PR head is already in the checkout, and posts nothing", async () => {
    const fake = fakeExec({ isAncestor: true });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain(`PR head ${PR_SHA} is already in HEAD`);
    expect(passingEval).not.toHaveBeenCalled();
    expect(fake.comments).toEqual([]);
  });

  it("propagates unexpected merge-base failures as exit 2", async () => {
    const fake = fakeExec();
    const exec: Exec = async (cmd, args, opts) => {
      if (args[0] === "merge-base") throw new ExecError("fatal: bad object", 128);
      return fake.exec(cmd, args, opts);
    };
    expect(await runCli(["7"], { exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("fatal: bad object");
  });

  it.each([
    ["no draft", [["A", `${ENRICHED_DIR}reddit-neovim.json`]]],
    ["a deleted draft", [["D", DRAFT], ["A", `${ENRICHED_DIR}reddit-neovim.json`]]],
    [
      "two drafts",
      [["A", DRAFT], ["A", "content/issues/2026-11-09.mdx"], ["A", `${ENRICHED_DIR}reddit-neovim.json`]],
    ],
  ] satisfies Array<[string, Array<[string, string]>]>)("exits 2 with %s in the diff", async (_label, changes) => {
    const fake = fakeExec({ changes });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("expected exactly one changed content/issues/<YYYY-MM-DD>.mdx");
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("exits 2 when the PR adds no enriched files", async () => {
    const fake = fakeExec({ changes: [["A", DRAFT]] });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain(`the PR adds nothing under ${ENRICHED_DIR}`);
    expect(passingEval).not.toHaveBeenCalled();
  });

  it.each([
    ["under another date", "pipeline/data/enriched/2026-10-26/reddit-neovim.json"],
    ["outside any date dir", "pipeline/data/enriched/notes.json"],
  ])("exits 2 when an enriched change sits %s", async (_label, other) => {
    const fake = fakeExec({
      changes: [["A", DRAFT], ["A", `${ENRICHED_DIR}reddit-neovim.json`], ["A", other]],
    });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain(`enriched change ${JSON.stringify(other)} is outside ${ENRICHED_DIR}`);
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("exits 2 when the enriched dir's date differs from the draft's", async () => {
    const fake = fakeExec({
      changes: [["A", DRAFT], ["A", "pipeline/data/enriched/2026-10-26/reddit-neovim.json"]],
    });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("is outside pipeline/data/enriched/2026-11-02/");
  });

  it.each(["M", "D", "T"])("exits 2 when an enriched file has diff status %s", async (status) => {
    const fake = fakeExec({
      changes: [["A", DRAFT], ["A", `${ENRICHED_DIR}reddit-neovim.json`], [status, `${ENRICHED_DIR}github-neovim-neovim-releases.json`]],
    });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain(`has diff status ${status}; a weekly PR may only add evidence`);
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("exits 2 when the enriched dir already exists on the base branch", async () => {
    const fake = fakeExec({ enrichedOnBase: true });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain(`${ENRICHED_DIR} already exists on origin/main`);
    expect(passingEval).not.toHaveBeenCalled();
  });

  it.each([
    ["a subdirectory", { mode: "040000", type: "tree", size: "-", path: `${ENRICHED_DIR}nested` }],
    ["a dotfile", { mode: "100644", type: "blob", size: 2, path: `${ENRICHED_DIR}.hidden.json` }],
    ["a symlink", { mode: "120000", type: "blob", size: 10, path: `${ENRICHED_DIR}link.json` }],
    ["an executable", { mode: "100755", type: "blob", size: 2, path: `${ENRICHED_DIR}x.json` }],
    ["a non-json file", { mode: "100644", type: "blob", size: 2, path: `${ENRICHED_DIR}x.txt` }],
  ] satisfies Array<[string, TreeEntry]>)("exits 2 when the enriched dir holds %s", async (_label, bad) => {
    const fake = fakeExec({ tree: [...blobEntries(DEFAULT_BLOBS), bad] });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("refusing enriched entry");
    expect(passingEval).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.args[0] === "cat-file")).toBe(false);
  });

  it("exits 2 when the enriched files exceed the size cap", async () => {
    const fake = fakeExec({
      tree: [
        { mode: "100644", type: "blob", size: MAX_ENRICHED_BYTES, path: `${ENRICHED_DIR}a.json` },
        { mode: "100644", type: "blob", size: 1, path: `${ENRICHED_DIR}b.json` },
      ],
    });
    expect(await runCli(["7"], { exec: fake.exec, evalDraft: passingEval })).toBe(2);
    expect(stderr).toContain("over the 5242880-byte cap");
    expect(passingEval).not.toHaveBeenCalled();
  });

  it("judges the PR's blobs with trusted eval-draft and posts a PASS comment", async () => {
    const fake = fakeExec();

    const code = await runCli(["7"], { exec: fake.exec, evalDraft: passingEval });

    expect(code).toBe(0);
    expect(evalArgv).toBeDefined();
    const [mdxPath, ...rest] = evalArgv!;
    const tmp = path.dirname(mdxPath);
    expect(path.basename(tmp)).toMatch(/^twin-judge-/);
    expect(path.basename(mdxPath)).toBe("2026-11-02.mdx");
    expect(rest).toEqual(["--skip-links", "--faithfulness", "--enriched-dir", path.join(tmp, "enriched")]);
    expect(evalFiles).toEqual({
      mdx: DEFAULT_BLOBS[DRAFT],
      "reddit-neovim.json": DEFAULT_BLOBS[`${ENRICHED_DIR}reddit-neovim.json`],
      "github-neovim-neovim-releases.json": DEFAULT_BLOBS[`${ENRICHED_DIR}github-neovim-neovim-releases.json`],
    });
    expect(existsSync(tmp)).toBe(false);

    expect(fake.comments).toHaveLength(1);
    const body = fake.comments[0];
    expect(body.startsWith("### Faithfulness judge: PASS\n")).toBe(true);
    expect(body).toContain(`PR head: \`${PR_SHA}\``);
    expect(body).toContain(`Draft: \`${DRAFT}\``);
    expect(body).toContain(`Enriched: \`${ENRICHED_DIR}\` (2 files)`);
    expect(body).toContain(`Judge code: \`${JUDGE_SHA}\``);
    expect(body).toContain("provenance is not independently verified, so human review remains the gate");
    expect(body).toContain("```text\neval-draft: ok");
    expect(body).toContain("faithfulness usage:");
    expect(stdout).toContain("judge-pr: posted faithfulness PASS to https://github.com/zuqini/this-week-in-neovim/pull/7");

    for (const { cmd, args } of fake.calls) {
      const allowed =
        cmd === "git"
          ? ALLOWED_GIT.has(args[0])
          : args[0] === "pr" && (args[1] === "view" || args[1] === "comment");
      expect(allowed, `${cmd} ${args.join(" ")}`).toBe(true);
    }
    expect(
      fake.calls
        .filter((c) => c.args[0] === "cat-file")
        .every((c) => c.args[1] === "blob" && c.args[2].startsWith(`${PR_SHA}:`)),
    ).toBe(true);
  });

  it("posts a FAIL comment and exits 1 when eval fails", async () => {
    const fake = fakeExec();
    const failingEval = async () => {
      process.stderr.write("faithfulness: 1/4 unfaithful\n  - [^s2] claim: not in source\n");
      return 1;
    };

    expect(await runCli(["7"], { exec: fake.exec, evalDraft: failingEval })).toBe(1);

    expect(fake.comments).toHaveLength(1);
    expect(fake.comments[0].startsWith("### Faithfulness judge: FAIL\n")).toBe(true);
    expect(fake.comments[0]).toContain("1/4 unfaithful");
  });

  it("exits 2 and posts nothing when eval throws", async () => {
    const fake = fakeExec();
    const throwingEval = async (): Promise<number> => {
      throw new Error("boom");
    };

    expect(await runCli(["7"], { exec: fake.exec, evalDraft: throwingEval })).toBe(2);
    expect(fake.comments).toEqual([]);
    expect(stderr).toContain("judge-pr: boom");
  });

  it("prints the comment instead of posting it with --no-comment", async () => {
    const fake = fakeExec();

    expect(await runCli(["7", "--no-comment"], { exec: fake.exec, evalDraft: passingEval })).toBe(0);

    expect(fake.calls.some((c) => c.cmd === "gh" && c.args[1] === "comment")).toBe(false);
    expect(stdout).toContain("### Faithfulness judge: PASS");
    expect(stdout).toContain(`Judge code: \`${JUDGE_SHA}\``);
  });

  it("uses a fence one backtick longer than any backtick run in the output", async () => {
    const fake = fakeExec();
    const noisyEval = async () => {
      process.stderr.write("citations:\n  - bad ``` fence in body\n");
      return 1;
    };

    await runCli(["7"], { exec: fake.exec, evalDraft: noisyEval });

    const body = fake.comments[0];
    expect(body).toContain("````text\ncitations:\n  - bad ``` fence in body\n````\n");
  });

  it("truncates long eval output so the comment stays under GitHub's limit", async () => {
    const fake = fakeExec();
    const extra = 5_000;
    const longEval = async () => {
      process.stderr.write("x".repeat(MAX_OUTPUT_CHARS - 2) + "`````" + "Z".repeat(extra));
      return 1;
    };

    await runCli(["7"], { exec: fake.exec, evalDraft: longEval });

    const body = fake.comments[0];
    expect(body.length).toBeLessThan(65_536);
    expect(body).toContain(`… truncated ${extra + 3} chars\n`);
    expect(body).toContain("```text\n");
    expect(body).not.toContain("````text");
    expect(body).not.toContain("Z");
  });
});
