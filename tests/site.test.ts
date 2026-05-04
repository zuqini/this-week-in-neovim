import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("absoluteUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prefixes the default site origin and a leading slash", async () => {
    const { absoluteUrl } = await import("@/lib/site");
    expect(absoluteUrl("/x")).toBe("https://thisweekinneovim.org/x");
  });

  it("inserts a missing leading slash", async () => {
    const { absoluteUrl } = await import("@/lib/site");
    expect(absoluteUrl("x")).toBe("https://thisweekinneovim.org/x");
  });

  it("strips a trailing slash from SITE.url", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    const { absoluteUrl } = await import("@/lib/site");
    expect(absoluteUrl("/x")).toBe("https://example.com/x");
  });

  it("honors NEXT_PUBLIC_SITE_URL override", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.example.com");
    const { absoluteUrl, SITE } = await import("@/lib/site");
    expect(SITE.url).toBe("https://staging.example.com");
    expect(absoluteUrl("/feed.xml")).toBe(
      "https://staging.example.com/feed.xml",
    );
  });
});

describe("issueHref", () => {
  it("formats a slug into a trailing-slash issue path", async () => {
    const { issueHref } = await import("@/lib/site");
    expect(issueHref("2026-05-04")).toBe("/issues/2026-05-04/");
  });
});

describe("SITE_HOST", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the host of the default SITE.url", async () => {
    const { SITE_HOST } = await import("@/lib/site");
    expect(SITE_HOST).toBe("thisweekinneovim.org");
  });

  it("returns host:port for a non-default port", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const { SITE_HOST } = await import("@/lib/site");
    expect(SITE_HOST).toBe("localhost:3000");
  });
});

describe("SITE.url validation", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws at module load when NEXT_PUBLIC_SITE_URL is missing a scheme", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "thisweekinneovim.org");
    await expect(import("@/lib/site")).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL is not a valid absolute URL/,
    );
  });
});

describe("PALETTE / globals.css mirror", () => {
  it("PALETTE.bgLight and PALETTE.bgDark match the --bg values in globals.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const css = fs.readFileSync(
      path.join(process.cwd(), "app", "globals.css"),
      "utf8",
    );
    const { PALETTE } = await import("@/lib/theme");

    const lightBgRoot = css.match(/:root\s*\{[^}]*--bg:\s*([^;]+);/);
    expect(lightBgRoot?.[1]?.trim()).toBe(PALETTE.bgLight);

    const darkBg = css.match(
      /prefers-color-scheme:\s*dark\)[\s\S]*?--bg:\s*([^;]+);/,
    );
    expect(darkBg?.[1]?.trim()).toBe(PALETTE.bgDark);
  });
});
