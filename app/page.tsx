import Link from "next/link";
import { getAllIssues } from "@/lib/issues";
import { formatIssueDate } from "@/lib/date";
import { IssueRow } from "@/components/issue-row";
import { IssueBody } from "@/components/issue-body";
import { SITE, issueHref } from "@/lib/site";

export default function HomePage() {
  const issues = getAllIssues();

  if (issues.length === 0) {
    return (
      <section className="prose max-w-none">
        <h1>{SITE.name}</h1>
        <p>{SITE.description}</p>
        <p>
          The first issue is on the way. In the meantime, subscribe via{" "}
          <a href="/feed.xml">RSS</a>.
        </p>
      </section>
    );
  }

  const [latest, ...rest] = issues;
  const earlier = rest.slice(0, 5);

  return (
    <div className="space-y-16">
      <Hero />
      <section aria-labelledby="latest-heading">
        <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-sm text-muted">
            Issue #{latest.issue}
          </span>
          <time dateTime={latest.date} className="text-sm text-muted">
            {formatIssueDate(latest.date)}
          </time>
          <span className="ml-auto text-sm">
            <Link href={issueHref(latest.slug)} className="no-underline hover:underline">
              Permalink →
            </Link>
          </span>
        </div>
        <h1 id="latest-heading" className="text-3xl sm:text-4xl font-semibold mb-2">
          {latest.title}
        </h1>
        {latest.summary && (
          <p className="text-fg/80 text-lg mb-8">{latest.summary}</p>
        )}
        <IssueBody slug={latest.slug} />
      </section>

      {earlier.length > 0 && (
        <section aria-labelledby="earlier-heading">
          <h2 id="earlier-heading" className="text-xl font-semibold mb-4">
            Earlier issues
          </h2>
          <ul className="list-none p-0 m-0">
            {earlier.map((issue) => (
              <IssueRow key={issue.slug} issue={issue} />
            ))}
          </ul>
          <p className="mt-6 text-sm">
            <Link href="/issues/" className="no-underline hover:underline">
              See the full archive →
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}

function Hero() {
  return (
    <section className="border-l-2 border-link pl-5 sm:pl-7 py-2">
      <p className="font-mono text-sm text-muted mb-2">$ :TWiN</p>
      <h2 className="text-2xl sm:text-3xl font-semibold leading-tight">
        A weekly roundup of new and updated Neovim plugins,
        <br className="hidden sm:block" /> ecosystem news, and notable community
        posts.
      </h2>
      <p className="mt-3 text-fg/75">
        Every Monday. Drafted from public sources, every claim cited, every
        issue human-reviewed before it ships.
      </p>
    </section>
  );
}
