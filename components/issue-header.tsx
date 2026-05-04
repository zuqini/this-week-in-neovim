import Link from "next/link";
import { type IssueMeta } from "@/lib/issues";
import { formatIssueDate } from "@/lib/date";
import { issueHref } from "@/lib/site";

type Props = {
  issue: IssueMeta;
  headingId?: string;
  permalink?: boolean;
};

export function IssueHeader({ issue, headingId, permalink = false }: Props) {
  return (
    <header>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-sm text-muted">
          Issue #{issue.issue}
        </span>
        <time dateTime={issue.date} className="text-sm text-muted">
          {formatIssueDate(issue.date)}
        </time>
        {permalink && (
          <span className="ml-auto text-sm">
            <Link
              href={issueHref(issue.slug)}
              className="no-underline hover:underline"
            >
              Permalink →
            </Link>
          </span>
        )}
      </div>
      <h1
        id={headingId}
        className="text-3xl sm:text-4xl font-semibold leading-tight"
      >
        {issue.title}
      </h1>
      {issue.summary && (
        <p className="mt-3 text-fg/80 text-lg">{issue.summary}</p>
      )}
    </header>
  );
}
