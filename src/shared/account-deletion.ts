/** Better Auth error code for a sign-in refused because the account is
 *  waiting to be deleted. Google sign-in carries it to /auth-error. */
export const ACCOUNT_DELETION_SCHEDULED_ERROR = "ACCOUNT_DELETION_SCHEDULED";

/** A deletion date as people read it, e.g. "November 16, 2026". */
export const formatDeletionDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
