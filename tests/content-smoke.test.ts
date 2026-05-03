import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseIssueMeta } from "@/lib/issues";

const CONTENT_DIR = path.join(import.meta.dirname, "..", "content", "issues");

describe.skipIf(!fs.existsSync(CONTENT_DIR))("content/issues/*.mdx", () => {
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"));

  it("the directory is non-empty", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`parses ${file} cleanly`, () => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
      expect(() => parseIssueMeta(raw, slug)).not.toThrow();
    });
  }
});
