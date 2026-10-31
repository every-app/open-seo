/**
 * Every PostHog feature flag the server reads, through isFeatureFlagOn. Each
 * is a global boolean that can change without a deploy. Off is the normal
 * state, and a flag reads off whenever PostHog can't answer, so nothing may
 * depend on one being on.
 */
export enum FeatureFlag {
  // Stops the cron starting scheduled rank checks during a DataForSEO outage.
  // Rank tracking pages warn paid users with a scheduled tracker while it's on.
  PauseScheduledRankChecks = "pause-scheduled-rank-checks",
}
