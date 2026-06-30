import {
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  SEO_DATA_COST_MARKUP,
  roundUsdForBilling,
} from "./billing";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

// ---------------------------------------------------------------------------
// Cost constants
// ---------------------------------------------------------------------------

/** DataForSEO Live API: cost of first page (10 results) */
const LIVE_BASE_PAGE_COST_USD = 0.002;

/** DataForSEO Live API: cost of each additional page (75% of base) */
const LIVE_EXTRA_PAGE_COST_USD = 0.0015;

/** DataForSEO task queue (standard priority): cost of first page (10 results) */
const QUEUED_BASE_PAGE_COST_USD = 0.0006;

/** DataForSEO task queue (standard priority): cost of each additional page (75% of base) */
const QUEUED_EXTRA_PAGE_COST_USD = 0.00045;

/**
 * How a rank check reaches DataForSEO: "live" is the instant endpoint used for
 * manual checks; "queued" is the cheaper task queue used for scheduled checks.
 */
type RankCheckMethod = "live" | "queued";

/** How many keywords are checked per batch */
export const KEYWORDS_PER_BATCH = 10;

/** Approximate seconds per batch */
export const SECONDS_PER_BATCH = 6;

/** Maximum keywords allowed per rank tracking config */
export const MAX_KEYWORDS_PER_CONFIG = 1000;

/** Maximum configs (domain+location combos) per project */
export const MAX_CONFIGS_PER_PROJECT = 100;

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/** DataForSEO cost for a single SERP request at the given depth. */
function costPerSerpAtDepth(depth: number, method: RankCheckMethod): number {
  const pages = depth / 10;
  return method === "queued"
    ? QUEUED_BASE_PAGE_COST_USD + (pages - 1) * QUEUED_EXTRA_PAGE_COST_USD
    : LIVE_BASE_PAGE_COST_USD + (pages - 1) * LIVE_EXTRA_PAGE_COST_USD;
}

export function depthToPages(depth: number): number {
  return depth / 10;
}

export function pagesToDepth(pages: number): number {
  return pages * 10;
}

export function estimateRankCheckCredits(
  keywordCount: number,
  devices: RankTrackingConfig["devices"],
  depth: number,
  method: RankCheckMethod,
) {
  const totalChecks = keywordCount * devicesCount(devices);
  const costUsd = roundUsdForBilling(
    totalChecks * costPerSerpAtDepth(depth, method) * SEO_DATA_COST_MARKUP,
  );
  const costCredits = Math.ceil(costUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD);
  return { costUsd, costCredits };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

type ScheduledRankTrackingInterval = Exclude<
  RankTrackingConfig["scheduleInterval"],
  "manual"
>;

export function isScheduledRankTrackingInterval(
  interval: RankTrackingConfig["scheduleInterval"],
): interval is ScheduledRankTrackingInterval {
  return interval !== "manual";
}

function endOfMonthWithTime(source: Date, monthOffset = 0): Date {
  const endOfMonth = new Date(
    Date.UTC(
      source.getUTCFullYear(),
      source.getUTCMonth() + monthOffset + 1,
      0,
    ),
  );
  endOfMonth.setUTCHours(
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  );
  return endOfMonth;
}

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
  interval: ScheduledRankTrackingInterval,
  previousNextCheckAt?: string | null,
): string {
  const now = Date.now();

  if (interval === "monthly") {
    if (previousNextCheckAt) {
      const anchor = new Date(previousNextCheckAt);
      let monthOffset = 1;
      let nextDate = endOfMonthWithTime(anchor, monthOffset);
      while (nextDate.getTime() <= now) {
        monthOffset += 1;
        nextDate = endOfMonthWithTime(anchor, monthOffset);
      }
      return nextDate.toISOString();
    }

    const hour = 4 + Math.floor(Math.random() * 6);
    const minute = Math.floor(Math.random() * 60);
    const nextDate = endOfMonthWithTime(new Date());
    nextDate.setUTCHours(hour, minute, 0, 0);
    if (nextDate.getTime() <= now) {
      const followingMonth = endOfMonthWithTime(nextDate, 1);
      followingMonth.setUTCHours(hour, minute, 0, 0);
      return followingMonth.toISOString();
    }
    return nextDate.toISOString();
  }

  const daysAhead = interval === "daily" ? 1 : 7;

  if (previousNextCheckAt) {
    const anchor = new Date(previousNextCheckAt).getTime();
    const intervalMs = daysAhead * 86_400_000;
    const steps = Math.floor(Math.max(0, now - anchor) / intervalMs) + 1;
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
  if (interval === "monthly") return "Monthly";
  return "Manual";
}

export function devicesCount(devices: RankTrackingConfig["devices"]): number {
  return devices === "both" ? 2 : 1;
}
