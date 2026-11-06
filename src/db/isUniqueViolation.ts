// Drizzle wraps the driver error in a "Failed query" error, so check the cause
// chain. SQLite reports the violation in the message, Postgres as code 23505.
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("UNIQUE constraint failed")) return true;
  if ("code" in error && error.code === "23505") return true;
  return isUniqueViolation(error.cause);
}
