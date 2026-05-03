import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("siteHost", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("strips https:// from the default SITE.url", async () => {
    const { siteHost } = await import("@/lib/og");
    expect(siteHost()).toBe("thisweekinneovim.org");
  });

  it("strips http:// when env-stubbed to that protocol", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const { siteHost } = await import("@/lib/og");
    expect(siteHost()).toBe("localhost:3000");
  });
});

describe("OgFrame", () => {
  it("renders the :TWiN brand mark and footer text", async () => {
    const { OgFrame } = await import("@/lib/og");
    const html = renderToStaticMarkup(
      <OgFrame footer="Footer string">Body</OgFrame>,
    );
    expect(html).toContain(":TWiN");
    expect(html).toContain("Footer string");
    expect(html).toContain("Body");
  });

  it("renders the topRight slot when provided", async () => {
    const { OgFrame } = await import("@/lib/og");
    const html = renderToStaticMarkup(
      <OgFrame topRight={<span>top-right-slot</span>} footer="f">
        Body
      </OgFrame>,
    );
    expect(html).toContain("top-right-slot");
  });
});

describe("OG_FONTS", () => {
  it("exports two Inter weights with non-empty font buffers", async () => {
    const { OG_FONTS } = await import("@/lib/og");
    expect(OG_FONTS).toHaveLength(2);
    const weights = OG_FONTS.map((f) => f.weight).sort();
    expect(weights).toEqual([400, 700]);
    for (const f of OG_FONTS) {
      expect(f.name).toBe("Inter");
      expect(f.style).toBe("normal");
      expect(f.data.length).toBeGreaterThan(0);
    }
  });
});
