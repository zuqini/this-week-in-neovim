import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";
export const alt = SITE.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 36,
              color: "#5fb950",
            }}
          >
            :TWiN
          </span>
          <span style={{ color: "#1174b1", fontSize: 28 }}>
            {SITE.url.replace(/^https?:\/\//, "")}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              color: "#a9d5c4",
              letterSpacing: -1,
            }}
          >
            {SITE.name}
          </div>
          <div style={{ fontSize: 32, color: "#6b8a82", maxWidth: 980 }}>
            {SITE.description}
          </div>
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
          <span>Every Monday · Drafted from public sources, every claim cited</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
