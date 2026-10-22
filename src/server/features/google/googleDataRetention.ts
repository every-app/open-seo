import { GoogleAccountService } from "@/server/features/google/GoogleAccountService";

// A grant gets a day to be bound to a project after the connect flow.
const UNUSED_GRANT_GRACE_MS = 24 * 60 * 60 * 1000;
// Each grant costs a token refresh and a revocation at Google plus a few
// queries. The daily cron has 15 minutes for all its jobs, so the purge stops
// starting new grants after this and the backlog continues the next day.
const PURGE_TIME_BUDGET_MS = 8 * 60 * 1000;

/**
 * Daily cron body: drops Google grants no project uses any more, as the
 * privacy policy promises. Cached Google reports expire on their own: the
 * bucket's `dataforseo-cache/` lifecycle rule deletes them after 7 days.
 */
export async function purgeUnusedGoogleData(now = new Date()) {
  const googleGrants = await GoogleAccountService.purgeUnusedGrants(
    new Date(now.getTime() - UNUSED_GRANT_GRACE_MS),
    now.getTime() + PURGE_TIME_BUDGET_MS,
  );
  return { googleGrants };
}
