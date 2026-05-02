import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s — ${SITE.shortName}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.author }],
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: SITE.name }],
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.name,
    description: SITE.description,
    url: SITE.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.description,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7eee8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f191f" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-bg focus:text-fg focus:px-3 focus:py-1 focus:border focus:border-border-themed"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-10 sm:py-14">
            {children}
          </div>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link
          href="/"
          className="no-underline font-semibold text-fg hover:text-link"
          aria-label={`${SITE.name} — home`}
        >
          <span className="font-mono text-link">:TWiN</span>
          <span className="text-muted ml-2 hidden sm:inline">
            {SITE.name}
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/issues/" className="no-underline hover:underline">
            Archive
          </Link>
          <a href="/feed.xml" className="no-underline hover:underline">
            RSS
          </a>
          <a
            href={SITE.github}
            className="no-underline hover:underline"
            rel="noreferrer noopener"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] mt-16">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span>
          © {new Date().getFullYear()} {SITE.name}.
        </span>
        <span>
          Independent, community-run weekly. Inspired by the original{" "}
          <a href="https://dotfyle.com/this-week-in-neovim">dotfyle TWiN</a>.
        </span>
        <a href="/feed.xml" className="ml-auto no-underline hover:underline">
          Subscribe via RSS →
        </a>
      </div>
    </footer>
  );
}
