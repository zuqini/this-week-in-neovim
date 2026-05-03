import { ImageResponse } from "next/og";
import { getIssueBySlug, getIssueSlugs } from "@/lib/issues";
import { formatIssueDate } from "@/lib/date";
import { SITE } from "@/lib/site";
import { OG_SIZE, OgIssueCard, getOgFonts } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;
export const alt = "This Week in Neovim issue";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return getIssueSlugs().map((slug) => ({ slug }));
}

export default async function IssueOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getIssueBySlug(slug);

  return new ImageResponse(
    (
      <OgIssueCard
        title={issue?.title ?? SITE.name}
        issueNumber={issue?.issue ?? 0}
        date={issue ? formatIssueDate(issue.date) : ""}
      />
    ),
    { ...size, fonts: getOgFonts() },
  );
}
