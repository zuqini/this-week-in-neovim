import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PALETTE } from "./theme";
import { SITE } from "./site";

// `import.meta.dirname` isn't substituted by webpack; use cwd. `next build`
// is always invoked from the project root.
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_FONTS = [
  {
    name: "Inter",
    data: fs.readFileSync(path.join(FONTS_DIR, "Inter-Regular.ttf")),
    weight: 400 as const,
    style: "normal" as const,
  },
  {
    name: "Inter",
    data: fs.readFileSync(path.join(FONTS_DIR, "Inter-Bold.ttf")),
    weight: 700 as const,
    style: "normal" as const,
  },
];

export function OgFrame({
  topRight,
  children,
  footer,
}: {
  topRight?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: `linear-gradient(135deg, ${PALETTE.bgDark} 0%, #0b151b 60%, #0f2a23 100%)`,
        color: PALETTE.fgDark,
        fontFamily: "Inter",
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
            fontFamily: "Inter, ui-monospace",
            fontSize: 32,
            color: PALETTE.accentGreen,
          }}
        >
          :TWiN
        </span>
        {topRight}
      </div>
      {children}
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
        <span>{footer}</span>
      </div>
    </div>
  );
}

export function siteHost(): string {
  return SITE.url.replace(/^https?:\/\//, "");
}
