import type { MetadataRoute } from "next";
import { getAllIssues } from "@/lib/issues";
import { issueDate } from "@/lib/date";
import { absoluteUrl, issueHref, SITE_FLOOR_DATE } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const issues = getAllIssues();
  const last = issues[0] ? issueDate(issues[0].date) : SITE_FLOOR_DATE;
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
      lastModified: issueDate(issue.date),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
