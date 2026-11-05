import { env } from "cloudflare:workers";

/**
 * Every feature flag the server reads, through isFeatureFlagOn. Each is a
 * global boolean in hosted production's Flagship app, created and flipped in
 * the Cloudflare dashboard, so it can change without a deploy. Off is the
 * normal state, and a flag reads off whenever Flagship can't answer, so
 * nothing may depend on one being on.
 */
export enum FeatureFlag {
  // Stops the cron starting scheduled rank checks during a DataForSEO outage.
  // Rank tracking pages warn paid users with a scheduled tracker while it's on.
  PauseScheduledRankChecks = "pause-scheduled-rank-checks",
  // Stops new guest accounts for MCP connections; people get the normal
  // sign-in page instead (src/server/auth/guest-accounts.ts).
  PauseMcpGuestAccounts = "pause-mcp-guest-accounts",
}

/**
 * Whether a feature flag is on. Only hosted production binds FLAGS
 * (deploy/alchemy/alchemy.run.ts), so self-hosted instances and previews never
 * answer to our flags.
 */
export async function isFeatureFlagOn(flag: FeatureFlag): Promise<boolean> {
  if (!env.FLAGS) return false;
  return env.FLAGS.getBooleanValue(flag, false);
}
