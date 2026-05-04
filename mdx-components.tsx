import type { MDXComponents } from "mdx/types";
import type { AnchorHTMLAttributes } from "react";
import { siteHost } from "@/lib/site";

function isExternal(href: string | undefined): boolean {
  if (!href) return false;
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== siteHost();
  } catch {
    return true;
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
  return { a: MdxAnchor, ...components };
}
