import type { MetadataRoute } from "next";
import { getAllIssues } from "@/lib/issues";
import { absoluteUrl, issueHref } from "@/lib/site";

const SITE_FLOOR_DATE = "2026-05-01";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const issues = getAllIssues();
  const last = issues[0]?.date ?? SITE_FLOOR_DATE;
  return [
    {
      url: absoluteUrl("/"),
      lastModified: last,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/issues/"),
      lastModified: last,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...issues.map((issue) => ({
      url: absoluteUrl(issueHref(issue.slug)),
      lastModified: issue.date,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
