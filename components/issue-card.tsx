import Link from "next/link";
import { type IssueMeta } from "@/lib/issues";
import { formatIssueDate } from "@/lib/date";
import { issueHref } from "@/lib/site";

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
          href={issueHref(issue.slug)}
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
