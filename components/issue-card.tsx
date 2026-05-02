import Link from "next/link";
import { formatIssueDate, type IssueMeta } from "@/lib/issues";

export function IssueCard({ issue }: { issue: IssueMeta }) {
  return (
    <article className="border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] hover:border-link transition-colors p-5 bg-accent-bg/40">
      <div className="flex items-baseline gap-3 text-sm text-muted">
        <span className="font-mono">#{issue.issue}</span>
        <time dateTime={issue.date}>{formatIssueDate(issue.date)}</time>
      </div>
      <h3 className="mt-1 text-xl font-semibold">
        <Link href={`/issues/${issue.slug}/`} className="no-underline hover:underline">
          {issue.title}
        </Link>
      </h3>
      {issue.summary && (
        <p className="mt-2 text-fg/85">{issue.summary}</p>
      )}
    </article>
  );
}

export function IssueRow({ issue }: { issue: IssueMeta }) {
  return (
    <li className="py-4 border-b border-[color-mix(in_srgb,var(--border-color)_30%,transparent)] last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-sm text-muted shrink-0">
          #{issue.issue}
        </span>
        <time dateTime={issue.date} className="text-sm text-muted shrink-0">
          {formatIssueDate(issue.date)}
        </time>
        <Link
          href={`/issues/${issue.slug}/`}
          className="font-semibold no-underline hover:underline"
        >
          {issue.title}
        </Link>
      </div>
      {issue.summary && (
        <p className="mt-1 text-fg/85 text-[0.95rem]">{issue.summary}</p>
      )}
    </li>
  );
}
