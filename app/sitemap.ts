import type { MetadataRoute } from "next";
import { getAllIssues } from "@/lib/issues";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const issues = getAllIssues();
  const now = new Date();
  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/issues/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...issues.map((issue) => ({
      url: absoluteUrl(`/issues/${issue.slug}/`),
      lastModified: new Date(`${issue.date}T00:00:00Z`),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
