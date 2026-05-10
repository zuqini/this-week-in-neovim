import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "@/pipeline/bin/scrape-github-releases";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE = [
  {
    tag_name: "nightly",
    html_url: "https://github.com/neovim/neovim/releases/tag/nightly",
    published_at: "2026-05-09T00:00:00Z",
    name: "Nightly",
    body: "release notes",
    draft: false,
    prerelease: true,
  },
];

describe("scrape-github-releases CLI", () => {
  let workdir: string;
  let oldFetch: typeof fetch;
  let oldToken: string | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "scrape-gh-rel-"));
    oldFetch = globalThis.fetch;
    oldToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
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
    (globalThis as { fetch: typeof fetch }).fetch = oldFetch;
    if (oldToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = oldToken;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await rm(workdir, { recursive: true, force: true });
  });

  it("writes a dated JSON file with the documented item shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SAMPLE));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const code = await runCli([
      "--owner=neovim",
      "--repo=neovim",
      `--out-dir=${workdir}`,
      "--since=2026-05-01T00:00:00Z",
      "--per-page=5",
    ]);

    expect(code).toBe(0);
    expect(stdout).toContain("wrote 1 releases");

    const dateDirs = await readdir(workdir);
    expect(dateDirs).toHaveLength(1);
    const files = await readdir(path.join(workdir, dateDirs[0]));
    expect(files).toContain("github-neovim-neovim-releases.json");

    const written = JSON.parse(
      await readFile(path.join(workdir, dateDirs[0], files[0]), "utf8"),
    );
    expect(written.source).toBe("github-releases");
    expect(written.items[0].tag_name).toBe("nightly");
    expect(written.items[0].body).toBe("release notes");
    expect(written.items[0].url).toBe(
      "https://github.com/neovim/neovim/releases/tag/nightly",
    );
    expect(written.items[0].published_at).toBe("2026-05-09T00:00:00Z");
  });

  it("sends Authorization when GITHUB_TOKEN is set", async () => {
    process.env.GITHUB_TOKEN = "supersecret";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    await runCli([`--out-dir=${workdir}`]);
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer supersecret");
  });

  it("exits 1 with a clear message on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Bad credentials", { status: 401 }),
    );
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const code = await runCli([`--out-dir=${workdir}`]);
    expect(code).toBe(1);
    expect(stderr).toContain("auth failed");
    expect(stderr).toContain("GITHUB_TOKEN");
  });

  it("rejects an invalid --since flag", async () => {
    const code = await runCli(["--since=not-a-date", `--out-dir=${workdir}`]);
    expect(code).toBe(1);
    expect(stderr).toContain("invalid --since");
  });

  it("accepts Nd shorthand for --since", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const code = await runCli(["--since=14d", `--out-dir=${workdir}`]);
    expect(code).toBe(0);
  });
});
