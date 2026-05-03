import type { MDXComponents } from "mdx/types";
import type { AnchorHTMLAttributes } from "react";
import { SITE } from "@/lib/site";

const SITE_HOST = new URL(SITE.url).host;

function isExternal(href: string | undefined): boolean {
  if (!href) return false;
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== SITE_HOST;
  } catch {
    return false;
  }
}

function MdxAnchor({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (isExternal(href)) {
    return (
      <a href={href} rel="noreferrer noopener" target="_blank" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components, a: MdxAnchor };
}
