export function issueDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function formatIssueDate(iso: string): string {
  return issueDate(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
