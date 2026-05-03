import type { ComponentType, AnchorHTMLAttributes } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useMDXComponents } from "@/mdx-components";

type AnchorComponent = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>;

function getAnchor(): AnchorComponent {
  const components = useMDXComponents({});
  return components.a as AnchorComponent;
}

function renderAnchor(href: string | undefined) {
  const A = getAnchor();
  return renderToStaticMarkup(<A href={href}>link</A>);
}

describe("MdxAnchor isExternal branches", () => {
  it("renders external rel/target for an off-host https URL", () => {
    const html = renderAnchor("https://example.com");
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://example.com"');
  });

  it("renders external rel/target for an off-host http URL", () => {
    const html = renderAnchor("http://example.com");
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
  });

  it("treats same-host https URL as internal (no rel/target)", () => {
    const html = renderAnchor("https://thisweekinneovim.org/x");
    expect(html).not.toContain("noreferrer");
    expect(html).not.toContain("_blank");
  });

  it("treats relative paths as internal", () => {
    const html = renderAnchor("/issues/2026-05-04/");
    expect(html).not.toContain("noreferrer");
    expect(html).not.toContain("_blank");
  });

  it("treats fragment anchors as internal", () => {
    const html = renderAnchor("#section");
    expect(html).not.toContain("noreferrer");
  });

  it("treats mailto: as internal (non-http(s))", () => {
    const html = renderAnchor("mailto:a@b");
    expect(html).not.toContain("noreferrer");
  });

  it("treats unparseable strings as internal", () => {
    const html = renderAnchor("not a url");
    expect(html).not.toContain("noreferrer");
  });

  it("treats undefined href as internal", () => {
    const html = renderAnchor(undefined);
    expect(html).not.toContain("noreferrer");
  });
});

describe("useMDXComponents", () => {
  it("exposes MdxAnchor as the `a` mapping", () => {
    const A = getAnchor();
    expect(typeof A).toBe("function");
    expect((A as { name?: string }).name).toBe("MdxAnchor");
  });

  it("preserves caller-supplied components when merging", () => {
    const Custom = () => <span />;
    const components = useMDXComponents({ p: Custom });
    expect(components.p).toBe(Custom);
    expect((components.a as { name?: string }).name).toBe("MdxAnchor");
  });
});
