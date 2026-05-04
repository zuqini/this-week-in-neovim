import { PALETTE } from "../theme";
import { SITE_HOST } from "../site";

const OG_TITLE_MAX = 90;

export function truncateOgTitle(title: string): string {
  const codePoints = Array.from(title);
  if (codePoints.length <= OG_TITLE_MAX) return title;
  return codePoints.slice(0, OG_TITLE_MAX - 1).join("").trimEnd() + "…";
}

const FRAME_STYLE = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between" as const,
  padding: "72px 80px",
  background: `linear-gradient(135deg, ${PALETTE.bgDark} 0%, ${PALETTE.bgGradientMid} 60%, ${PALETTE.bgGradientEnd} 100%)`,
  color: PALETTE.fgDark,
  fontFamily: "Inter",
};

function BrandMark() {
  return (
    <span
      style={{
        fontFamily: "Inter, ui-monospace",
        fontSize: 32,
        color: PALETTE.accentGreen,
      }}
    >
      :TWiN
    </span>
  );
}

function FooterStripe({ text }: { text: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 24,
        color: PALETTE.accentGreen,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${PALETTE.ctaFrom} 0%, ${PALETTE.ctaTo} 100%)`,
          display: "block",
        }}
      />
      <span>{text}</span>
    </div>
  );
}

export function OgIssueCard({
  title,
  issueNumber,
  date,
}: {
  title: string;
  issueNumber: number;
  date: string;
}) {
  return (
    <div style={FRAME_STYLE}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <BrandMark />
        <span style={{ color: PALETTE.mutedDark, fontSize: 24 }}>
          Issue #{issueNumber} · {date}
        </span>
      </div>
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
        {truncateOgTitle(title)}
      </div>
      <FooterStripe text={SITE_HOST} />
    </div>
  );
}

export function OgHomeCard({
  title,
  description,
  subtitle,
}: {
  title: string;
  description: string;
  subtitle: string;
}) {
  return (
    <div style={FRAME_STYLE}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <BrandMark />
        <span style={{ color: PALETTE.accentBlue, fontSize: 28 }}>
          {SITE_HOST}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            color: PALETTE.fgDark,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 32,
            color: PALETTE.mutedDark,
            maxWidth: 980,
          }}
        >
          {description}
        </div>
      </div>
      <FooterStripe text={subtitle} />
    </div>
  );
}
