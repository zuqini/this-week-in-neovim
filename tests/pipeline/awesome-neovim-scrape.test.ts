import { describe, expect, it, vi } from "vitest";
import {
  defaultSinceArg,
  ensureRepo,
  parseAdditions,
  scrapeRepo,
} from "@/pipeline/src/sources/awesome-neovim/scrape";

const SAMPLE_DIFF = `commit 1234abc5678
Author: Alice <a@example.com>
Date:   2026-05-08 12:00:00 +0000

    add new plugins

diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -120,6 +120,9 @@
 ## Plugins
 - [existing](https://github.com/owner/existing) - already there
+- [matugen.nvim](https://github.com/daedlock/matugen.nvim) - dynamic theme generator
+- [splitasm.nvim](https://github.com/x/splitasm.nvim) - split asm view
 ## More
+- [thorn.nvim](https://github.com/y/thorn.nvim) - thorn things
 - [other](https://github.com/o/other) - existing entry

commit deadbeefcafebabe
Author: Bob <b@example.com>
Date:   2026-05-09 12:00:00 +0000

    one more

diff --git a/README.md b/README.md
index 2222222..3333333 100644
--- a/README.md
+++ b/README.md
@@ -200,3 +200,4 @@
 - [extra](https://github.com/o/extra) - existing
+- [late](https://github.com/o/late) - added in second commit
`;

describe("parseAdditions", () => {
  it("captures all + entries with commit ids", () => {
    const items = parseAdditions(SAMPLE_DIFF);
    expect(items.map((i) => i.id)).toEqual([
      "https://github.com/daedlock/matugen.nvim",
      "https://github.com/x/splitasm.nvim",
      "https://github.com/y/thorn.nvim",
      "https://github.com/o/late",
    ]);
    expect(items[0].title).toBe("matugen.nvim");
    expect(items[0].description).toBe("dynamic theme generator");
    expect(items[0].addedInCommit).toBe("1234abc5678");
    expect(items[3].addedInCommit).toBe("deadbeefcafebabe");
  });

  it("ignores +++ file marker lines", () => {
    const items = parseAdditions(SAMPLE_DIFF);
    expect(items.find((i) => i.url.includes("README.md"))).toBeUndefined();
  });

  it("ignores edits to existing entries (only + new lines beyond context)", () => {
    const items = parseAdditions(SAMPLE_DIFF);
    expect(items.map((i) => i.url)).not.toContain(
      "https://github.com/owner/existing",
    );
    expect(items.map((i) => i.url)).not.toContain(
      "https://github.com/o/other",
    );
  });

  it("dedupes by URL", () => {
    const dup =
      SAMPLE_DIFF +
      "\ncommit ffffff\n\ndiff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,1 @@\n+- [matugen.nvim](https://github.com/daedlock/matugen.nvim) - dup\n";
    const items = parseAdditions(dup);
    const urls = items.map((i) => i.url);
    expect(urls.filter((u) => u === "https://github.com/daedlock/matugen.nvim")).toHaveLength(1);
  });

  it("accepts em-dash and en-dash separators", () => {
    const text = `commit aaa\n+- [a](https://x/a) — em-dash desc\n+- [b](https://x/b) – en-dash desc\n`;
    const items = parseAdditions(text);
    expect(items.map((i) => i.title)).toEqual(["a", "b"]);
    expect(items[0].description).toBe("em-dash desc");
    expect(items[1].description).toBe("en-dash desc");
  });

  it("returns empty for an empty diff", () => {
    expect(parseAdditions("")).toEqual([]);
  });
});

describe("scrapeRepo", () => {
  it("invokes git log with the right args and projects additions", async () => {
    const runGit = vi.fn().mockResolvedValue(SAMPLE_DIFF);
    const result = await scrapeRepo(
      { repoDir: "/tmp/repo", since: "2026-05-03T00:00:00Z" },
      { runGit },
    );

    expect(runGit).toHaveBeenCalledWith("/tmp/repo", [
      "log",
      "-p",
      "--no-color",
      "--since=2026-05-03T00:00:00Z",
      "--",
      "README.md",
    ]);
    expect(result.source).toBe("awesome-neovim");
    expect(result.params).toEqual({
      repoDir: "/tmp/repo",
      since: "2026-05-03T00:00:00Z",
      readme: "README.md",
    });
    expect(result.items).toHaveLength(4);
  });

  it("respects a custom readme path", async () => {
    const runGit = vi.fn().mockResolvedValue("");
    await scrapeRepo(
      { repoDir: "/tmp/repo", since: "2026-05-03", readme: "docs/list.md" },
      { runGit },
    );
    expect(runGit.mock.calls[0][1]).toContain("docs/list.md");
  });
});

describe("ensureRepo", () => {
  it("clones when the directory is absent", async () => {
    const runGit = vi.fn().mockResolvedValue("");
    const exists = vi.fn().mockResolvedValue(false);
    await ensureRepo("https://example/repo.git", "/tmp/repo", { runGit, exists });
    expect(runGit).toHaveBeenCalledWith(".", [
      "clone",
      "--quiet",
      "--filter=blob:none",
      "https://example/repo.git",
      "/tmp/repo",
    ]);
  });

  it("fetch + reset --hard when the directory exists", async () => {
    const runGit = vi.fn().mockResolvedValue("");
    const exists = vi.fn().mockResolvedValue(true);
    await ensureRepo("https://example/repo.git", "/tmp/repo", { runGit, exists });
    expect(runGit).toHaveBeenNthCalledWith(1, "/tmp/repo", [
      "fetch",
      "--quiet",
      "origin",
    ]);
    expect(runGit).toHaveBeenNthCalledWith(2, "/tmp/repo", [
      "reset",
      "--hard",
      "origin/HEAD",
      "--quiet",
    ]);
  });
});

describe("defaultSinceArg", () => {
  it("returns 7d ago in UTC ISO by default", () => {
    const now = new Date("2026-05-10T12:00:00.000Z");
    expect(defaultSinceArg(now)).toBe("2026-05-03T12:00:00.000Z");
  });
});
