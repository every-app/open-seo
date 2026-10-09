function auditDate(timestamp: string): Date {
  // SQLite CURRENT_TIMESTAMP is UTC but has no timezone marker. Postgres
  // already supplies ISO timestamps with Z; preserve explicit offsets too.
  const utcTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    timestamp,
  )
    ? `${timestamp.replace(" ", "T")}Z`
    : timestamp;
  return new Date(utcTimestamp);
}

export function formatDate(timestamp: string): string {
  return auditDate(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatStartedAt(timestamp: string): string {
  return auditDate(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
