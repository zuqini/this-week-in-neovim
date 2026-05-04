import "server-only";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { OG_SIZE, getOgFonts } from "./fonts";

export { OG_SIZE, getOgFonts } from "./fonts";
export { OgIssueCard, OgHomeCard, truncateOgTitle } from "./cards";

export function renderOg(card: ReactElement): ImageResponse {
  return new ImageResponse(card, { ...OG_SIZE, fonts: getOgFonts() });
}
