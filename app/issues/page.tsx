import type { Metadata } from "next";
import { getAllIssues } from "@/lib/issues";
import { IssueRow } from "@/components/issue-card";

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Every issue of This Week in Neovim, from the latest back to issue #1.",
  alternates: { canonical: "/issues/" },
};

export default function ArchivePage() {
  const issues = getAllIssues();

  const byYear = new Map<string, typeof issues>();
  for (const issue of issues) {
    const year = issue.date.slice(0, 4);
    const bucket = byYear.get(year) ?? [];
    bucket.push(issue);
    byYear.set(year, bucket);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a));

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
      {years.map((year) => (
        <section key={year} aria-labelledby={`year-${year}`}>
          <h2
            id={`year-${year}`}
            className="text-2xl font-semibold mb-2 font-mono text-link"
          >
            {year}
          </h2>
          <ul className="list-none p-0 m-0">
            {byYear.get(year)!.map((issue) => (
              <IssueRow key={issue.slug} issue={issue} />
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
