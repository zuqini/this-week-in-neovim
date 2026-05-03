import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";
import { PALETTE } from "@/lib/theme";
import { OG_FONTS, OG_SIZE, OgFrame, siteHost } from "@/lib/og";

export const dynamic = "force-static";
export const alt = SITE.name;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <OgFrame
        topRight={
          <span style={{ color: PALETTE.accentBlue, fontSize: 28 }}>
            {siteHost()}
          </span>
        }
        footer="Every Monday · Drafted from public sources, every claim cited"
      >
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
            {SITE.name}
          </div>
          <div
            style={{
              fontSize: 32,
              color: PALETTE.mutedDark,
              maxWidth: 980,
            }}
          >
            {SITE.description}
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: OG_FONTS },
  );
}
