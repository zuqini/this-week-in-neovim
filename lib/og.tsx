import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PALETTE } from "./theme";
import { siteHost } from "./site";

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

export const OG_SIZE = { width: 1200, height: 630 } as const;

type OgFont = {
  name: "Inter";
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

let _fonts: OgFont[] | null = null;

function readFont(file: string): Buffer {
  const full = path.join(FONTS_DIR, file);
  try {
    return fs.readFileSync(full);
  } catch (err) {
    throw new Error(
      `OG font missing: ${full}. Ensure public/fonts/${file} is present in the build artifact.`,
      { cause: err },
    );
  }
}

export function getOgFonts(): OgFont[] {
  if (_fonts === null) {
    _fonts = [
      {
        name: "Inter",
        data: readFont("Inter-Regular.ttf"),
        weight: 400,
        style: "normal",
      },
      {
        name: "Inter",
        data: readFont("Inter-Bold.ttf"),
        weight: 700,
        style: "normal",
      },
    ];
  }
  return _fonts;
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
        {title}
      </div>
      <FooterStripe text={siteHost()} />
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
          {siteHost()}
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
