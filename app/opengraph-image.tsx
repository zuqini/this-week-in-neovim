import { SITE } from "@/lib/site";
import { OG_SIZE, OgHomeCard, renderOg } from "@/lib/og";

export const dynamic = "force-static";
export const alt = SITE.name;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOg(
    <OgHomeCard
      title={SITE.name}
      description={SITE.description}
      subtitle="Every Monday · Drafted from public sources, every claim cited"
    />,
  );
}
