import { ImageResponse } from "next/og";
import { getIssueBySlug, getIssueSlugs, formatIssueDate } from "@/lib/issues";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";
export const dynamicParams = false;
export const alt = "This Week in Neovim issue";
export const size = { width: 1200, height: 630 };
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
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #0f191f 0%, #0b151b 60%, #0f2a23 100%)",
          color: "#a9d5c4",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 32,
              color: "#5fb950",
            }}
          >
            :TWiN
          </span>
          {issue && (
            <span style={{ color: "#6b8a82", fontSize: 24 }}>
              Issue #{issue.issue} · {formatIssueDate(issue.date)}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: "#a9d5c4",
            maxWidth: 1040,
          }}
        >
          {issue?.title ?? SITE.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 24,
            color: "#5fb950",
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #00b952 0%, #378ccc 100%)",
              display: "block",
            }}
          />
          <span>{SITE.url.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
