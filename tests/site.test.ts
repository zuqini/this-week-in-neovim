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
