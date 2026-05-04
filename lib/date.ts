const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function issueDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) {
    throw new Error(
      `issueDate: expected YYYY-MM-DD, got ${JSON.stringify(iso)}`,
    );
  }
  return new Date(`${iso}T00:00:00Z`);
}

export function formatIssueDate(iso: string): string {
  const d = issueDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
