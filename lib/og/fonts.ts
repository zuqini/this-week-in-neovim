import "server-only";
import fs from "node:fs";
import path from "node:path";
import { memoize } from "../memo";

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

export const OG_SIZE = { width: 1200, height: 630 } as const;

export type OgFont = {
  name: "Inter";
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

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

export const getOgFonts = memoize(
  (): OgFont[] => [
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
  ],
  { when: () => true },
);
