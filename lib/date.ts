const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function issueDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) {
    throw new Error(
      `issueDate: expected YYYY-MM-DD, got ${JSON.stringify(iso)}`,
    );
  }
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
