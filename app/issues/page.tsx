import type { Metadata } from "next";
import { getAllIssues, groupIssuesByYear } from "@/lib/issues";
import { IssueRow } from "@/components/issue-row";

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Every issue of This Week in Neovim, from the latest back to issue #1.",
  alternates: { canonical: "/issues/" },
};

export default function ArchivePage() {
  const issues = getAllIssues();
  const years = groupIssuesByYear(issues);

  return (
    <article className="space-y-12">
      <header>
        <h1 className="text-3xl sm:text-4xl font-semibold mb-2">Archive</h1>
        <p className="text-fg/80">
          {issues.length === 0
            ? "No issues yet."
            : `${issues.length} issue${issues.length === 1 ? "" : "s"} so far.`}
        </p>
      </header>
      {years.map(({ year, issues }) => (
        <section key={year} aria-labelledby={`year-${year}`}>
          <h2
            id={`year-${year}`}
            className="text-2xl font-semibold mb-2 font-mono text-link"
          >
            {year}
          </h2>
          <ul className="list-none p-0 m-0">
            {issues.map((issue) => (
              <IssueRow key={issue.slug} issue={issue} />
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
