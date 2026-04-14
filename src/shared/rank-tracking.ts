import {
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  SEO_DATA_COST_MARKUP,
  roundUsdForBilling,
} from "./billing";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

// ---------------------------------------------------------------------------
// Cost constants
// ---------------------------------------------------------------------------

/** Per-SERP cost from DataForSEO Live API */
const COST_PER_SERP_USD = 0.002;

/** How many keywords are checked per batch */
export const KEYWORDS_PER_BATCH = 10;

/** Approximate seconds per batch */
export const SECONDS_PER_BATCH = 6;

/** Maximum keywords allowed per rank tracking config */
export const MAX_KEYWORDS_PER_CONFIG = 1000;

/** Maximum configs (domain+location combos) per project */
export const MAX_CONFIGS_PER_PROJECT = 20;

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

export function estimateRankCheckCredits(
  keywordCount: number,
  devices: RankTrackingConfig["devices"],
) {
  const totalChecks = keywordCount * devicesCount(devices);
  const costUsd = roundUsdForBilling(
    totalChecks * COST_PER_SERP_USD * SEO_DATA_COST_MARKUP,
  );
  const costCredits = Math.ceil(costUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD);
  return { costUsd, costCredits };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * Compute the next check time for a scheduled config.
 *
 * If `previousNextCheckAt` is provided, advances from that anchor by the
 * interval until the result is in the future. This prevents schedule drift
 * when runs are delayed (e.g., a weekly config due Monday that fires on
 * Wednesday will still schedule the next check for the following Monday).
 *
 * Otherwise a random hour (04–09 UTC) and minute are chosen.
 */
export function computeNextCheckAt(
  interval: "daily" | "weekly",
  previousNextCheckAt?: string | null,
): string {
  const daysAhead = interval === "daily" ? 1 : 7;

  if (previousNextCheckAt) {
    const anchor = new Date(previousNextCheckAt).getTime();
    const intervalMs = daysAhead * 86_400_000;
    const steps = Math.floor(Math.max(0, Date.now() - anchor) / intervalMs) + 1;
    return new Date(anchor + steps * intervalMs).toISOString();
  }

  const nextDate = new Date();
  nextDate.setUTCDate(nextDate.getUTCDate() + daysAhead);
  const hour = 4 + Math.floor(Math.random() * 6);
  const minute = Math.floor(Math.random() * 60);
  nextDate.setUTCHours(hour, minute, 0, 0);
  return nextDate.toISOString();
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export function devicesLabel(devices: RankTrackingConfig["devices"]): string {
  if (devices === "both") return "Desktop + Mobile";
  return devices === "desktop" ? "Desktop" : "Mobile";
}

export function scheduleLabel(
  interval: RankTrackingConfig["scheduleInterval"],
): string {
  if (interval === "daily") return "Daily";
  if (interval === "weekly") return "Weekly";
  return "Manual";
}

export function devicesCount(devices: RankTrackingConfig["devices"]): number {
  return devices === "both" ? 2 : 1;
}
