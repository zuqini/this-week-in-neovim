import { notFound } from "next/navigation";
import {
  getAllIssues,
  getIssueBySlug,
  getIssueRouteParams,
} from "@/lib/issues";
import { formatIssueDate } from "@/lib/date";
import { OG_SIZE, OgIssueCard, renderOg } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;
export const alt = "This Week in Neovim issue";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return getIssueRouteParams(getAllIssues());
}

export default async function IssueOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getIssueBySlug(getAllIssues(), slug);
  if (!issue) notFound();

  return renderOg(
    <OgIssueCard
      title={issue.title}
      issueNumber={issue.issue}
      date={formatIssueDate(issue.date)}
    />,
  );
}
