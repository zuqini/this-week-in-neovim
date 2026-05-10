import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "@/pipeline/bin/scrape-awesome-neovim";

const execFileAsync = promisify(execFile);

async function git(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...env } as NodeJS.ProcessEnv,
  });
}

async function setupSampleRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await git(dir, ["init", "-q", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  await writeFile(
    path.join(dir, "README.md"),
    "# awesome-neovim\n\n## Plugins\n- [base](https://github.com/o/base) - base plugin\n",
  );
  await git(dir, ["add", "README.md"]);
  await git(
    dir,
    ["commit", "-q", "-m", "initial"],
    {
      GIT_AUTHOR_DATE: "2025-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2025-01-01T00:00:00Z",
    },
  );
  await writeFile(
    path.join(dir, "README.md"),
    "# awesome-neovim\n\n## Plugins\n- [base](https://github.com/o/base) - base plugin\n- [matugen.nvim](https://github.com/daedlock/matugen.nvim) - dynamic theme\n- [splitasm](https://github.com/x/splitasm) - asm split\n",
  );
  await git(dir, ["add", "README.md"]);
  const recent = "2026-05-09T12:00:00Z";
  await git(
    dir,
    ["commit", "-q", "-m", "two new entries"],
    { GIT_AUTHOR_DATE: recent, GIT_COMMITTER_DATE: recent },
  );
}

describe("scrape-awesome-neovim CLI", () => {
  let workdir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "awesome-cli-"));
    stdout = "";
    stderr = "";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((s: string) => {
      stdout += s;
      return true;
    }) as unknown as typeof process.stdout.write);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((s: string) => {
      stderr += s;
      return true;
    }) as unknown as typeof process.stderr.write);
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await rm(workdir, { recursive: true, force: true });
  });

  it("scrapes a local fixture repo with --no-fetch and writes the additions", async () => {
    const repoDir = path.join(workdir, "repo");
    const outDir = path.join(workdir, "out");
    await setupSampleRepo(repoDir);

    const code = await runCli([
      `--repo-dir=${repoDir}`,
      `--out-dir=${outDir}`,
      "--since=2026-01-01",
      "--no-fetch",
    ]);

    expect(code).toBe(0);
    expect(stdout).toContain("wrote 2 additions");

    const dateDirs = await readdir(outDir);
    const files = await readdir(path.join(outDir, dateDirs[0]));
    expect(files).toContain("awesome-neovim-additions.json");
    const written = JSON.parse(
      await readFile(path.join(outDir, dateDirs[0], "awesome-neovim-additions.json"), "utf8"),
    );
    expect(written.source).toBe("awesome-neovim");
    expect(written.items).toHaveLength(2);
    expect(written.items[0].url).toBe("https://github.com/daedlock/matugen.nvim");
    expect(written.items[0].title).toBe("matugen.nvim");
    expect(written.items[0].description).toBe("dynamic theme");
  });

  it("rejects an invalid --since flag", async () => {
    const code = await runCli([
      `--repo-dir=${workdir}`,
      `--out-dir=${workdir}/out`,
      "--since=not-a-date",
      "--no-fetch",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("invalid --since");
  });

  it("is idempotent: running twice yields the same items array", async () => {
    const repoDir = path.join(workdir, "repo");
    const outDir = path.join(workdir, "out");
    await setupSampleRepo(repoDir);

    await runCli([
      `--repo-dir=${repoDir}`,
      `--out-dir=${outDir}`,
      "--since=2026-01-01",
      "--no-fetch",
    ]);
    const date1 = (await readdir(outDir))[0];
    const first = JSON.parse(
      await readFile(path.join(outDir, date1, "awesome-neovim-additions.json"), "utf8"),
    );

    await runCli([
      `--repo-dir=${repoDir}`,
      `--out-dir=${outDir}`,
      "--since=2026-01-01",
      "--no-fetch",
    ]);
    const second = JSON.parse(
      await readFile(path.join(outDir, date1, "awesome-neovim-additions.json"), "utf8"),
    );

    expect(second.items).toEqual(first.items);
  });
});
