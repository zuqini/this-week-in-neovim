import { ImageResponse } from "next/og";
import { getIssueBySlug, getIssueSlugs, formatIssueDate } from "@/lib/issues";
import { SITE } from "@/lib/site";
import { PALETTE } from "@/lib/theme";
import { OG_FONTS, OG_SIZE, OgFrame, siteHost } from "@/lib/og";

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
      <OgFrame
        topRight={
          issue ? (
            <span style={{ color: PALETTE.mutedDark, fontSize: 24 }}>
              Issue #{issue.issue} · {formatIssueDate(issue.date)}
            </span>
          ) : null
        }
        footer={siteHost()}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: PALETTE.fgDark,
            maxWidth: 1040,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {issue?.title ?? SITE.name}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: OG_FONTS },
  );
}
