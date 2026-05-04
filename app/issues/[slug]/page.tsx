import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdjacent,
  getIssueBySlug,
  getIssueSlugs,
} from "@/lib/issues";
import { formatIssueDate } from "@/lib/date";
import { IssueBody } from "@/components/issue-body";
import { absoluteUrl, issueHref } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIssueSlugs().map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = getIssueBySlug(slug);
  if (!issue) return {};
  const url = absoluteUrl(issueHref(issue.slug));
  return {
    title: issue.title,
    description: issue.summary,
    alternates: { canonical: issueHref(issue.slug) },
    openGraph: {
      type: "article",
      title: issue.title,
      description: issue.summary,
      url,
      publishedTime: issue.date,
    },
    twitter: {
      card: "summary_large_image",
      title: issue.title,
      description: issue.summary,
    },
  };
}

export default async function IssuePage({ params }: { params: Params }) {
  const { slug } = await params;
  const issue = getIssueBySlug(slug);
  if (!issue) notFound();

  const { older, newer } = getAdjacent(issue.slug);

  return (
    <article className="space-y-10">
      <header>
        <p className="font-mono text-sm text-muted mb-2">
          Issue #{issue.issue} ·{" "}
          <time dateTime={issue.date}>{formatIssueDate(issue.date)}</time>
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
          {issue.title}
        </h1>
        {issue.summary && (
          <p className="mt-3 text-fg/80 text-lg">{issue.summary}</p>
        )}
      </header>

      <IssueBody slug={issue.slug} />

      <nav
        aria-label="Adjacent issues"
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8 border-t border-[color-mix(in_srgb,var(--border-color)_40%,transparent)]"
      >
        <div>
          {older && (
            <Link
              href={issueHref(older.slug)}
              className="block no-underline hover:underline"
            >
              <span className="block text-xs text-muted">← Older</span>
              <span className="block">{older.title}</span>
            </Link>
          )}
        </div>
        <div className="sm:text-right">
          {newer && (
            <Link
              href={issueHref(newer.slug)}
              className="block no-underline hover:underline"
            >
              <span className="block text-xs text-muted">Newer →</span>
              <span className="block">{newer.title}</span>
            </Link>
          )}
        </div>
      </nav>
    </article>
  );
}
