import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdjacent,
  getAllIssues,
  getIssueBySlug,
  getIssueRouteParams,
} from "@/lib/issues";
import { IssueBody } from "@/components/issue-body";
import { IssueHeader } from "@/components/issue-header";
import { absoluteUrl, issueHref } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIssueRouteParams(getAllIssues());
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = getIssueBySlug(getAllIssues(), slug);
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
  const issues = getAllIssues();
  const issue = getIssueBySlug(issues, slug);
  if (!issue) notFound();

  const { older, newer } = getAdjacent(issues, issue.slug);

  return (
    <article className="space-y-10">
      <IssueHeader issue={issue} />

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
