import {
  applyBillingMarkupUsd,
  creditsForProviderUsd,
  roundUsdForBilling,
} from "./billing";
import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";

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

/** Soft application limit for keywords per rank tracking config */
export const MAX_KEYWORDS_PER_CONFIG = 1000;

/** Maximum length of a single tracked keyword */
export const MAX_TRACKED_KEYWORD_LENGTH = 200;

/** Maximum configs (domain+location combos) per project */
export const MAX_CONFIGS_PER_PROJECT = 500;

/** Maximum queued rank-check tasks DataForSEO accepts in one task_post. */
export const MAX_TASKS_PER_POST = 100;

export const rankCheckCostApprovalError = (
  costCredits: number,
  maxCostCredits: number,
) => {
  return `The current rank check costs ${costCredits} credits, above the approved maximum of ${maxCostCredits}. Call estimate_rank_tracker_cost again and ask the user to approve the updated amount.`;
};

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/** DataForSEO cost for a single SERP request at the given depth. */
export function costPerSerpAtDepth(
  depth: number,
  method: RankCheckMethod,
): number {
  const pages = depth / 10;
  return method === "queued"
    ? QUEUED_BASE_PAGE_COST_USD + (pages - 1) * QUEUED_EXTRA_PAGE_COST_USD
    : LIVE_BASE_PAGE_COST_USD + (pages - 1) * LIVE_EXTRA_PAGE_COST_USD;
}

export function pagesToDepth(pages: number): number {
  return pages * 10;
}

// Google Organic bills 5x when the keyword contains an advanced search
// operator (docs.dataforseo.com/v3/serp/google/organic/live/advanced). The
// docs say "contains", so match anywhere: a false match only over-holds.
const SERP_OPERATOR_KEYWORD =
  /(allinanchor|allintext|allintitle|allinurl|cache|define|definition|filetype|id|inanchor|info|intext|intitle|inurl|link|site):/i;

export function serpKeywordCostMultiplier(keyword: string) {
  return SERP_OPERATOR_KEYWORD.test(keyword) ? 5 : 1;
}

export function estimateRankCheckCredits(
  keywords: readonly string[],
  devices: RankTrackingConfig["devices"],
  depth: number,
  method: RankCheckMethod,
) {
  // One entry per keyword/device pair, keyword-major like the workflow's
  // task list, so queued chunks group the same pairs the real posts do.
  const checkMultipliers = keywords.flatMap((keyword) =>
    Array<number>(devicesCount(devices)).fill(
      serpKeywordCostMultiplier(keyword),
    ),
  );
  const checksPerMeteredCall = method === "queued" ? MAX_TASKS_PER_POST : 1;
  let costUsd = 0;
  let costCredits = 0;

  // Metering rounds and ceilings each provider call independently. Live rank
  // checks make one call per keyword/device pair, while queued checks post up
  // to MAX_TASKS_PER_POST pairs per call. Summing one aggregate and rounding
  // once can therefore understate the credits that will actually be charged.
  for (
    let offset = 0;
    offset < checkMultipliers.length;
    offset += checksPerMeteredCall
  ) {
    const callMultiplier = checkMultipliers
      .slice(offset, offset + checksPerMeteredCall)
      .reduce((sum, multiplier) => sum + multiplier, 0);
    const callRawUsd = callMultiplier * costPerSerpAtDepth(depth, method);
    costUsd += applyBillingMarkupUsd(callRawUsd);
    costCredits += creditsForProviderUsd(callRawUsd);
  }

  // This is the nominal queued task_post estimate. Rejected, failed, or
  // timed-out tasks can later incur additional live-fallback spend.
  costUsd = roundUsdForBilling(costUsd);
  return { costUsd, costCredits };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

type ScheduledRankTrackingInterval = Exclude<
  RankTrackingConfig["scheduleInterval"],
  "manual"
>;

// Values written to rank_tracking_configs.last_skip_reason (free-form text in
// the schema; this union keeps writers and UI comparisons in sync).
export type RankTrackingSkipReason =
  | "plan_required"
  | "no_keywords"
  | "insufficient_credits";

export function estimateScheduledRankCheckCredits(
  keywords: readonly string[],
  devices: RankTrackingConfig["devices"],
  depth: number,
  scheduleInterval: ScheduledRankTrackingInterval,
) {
  const { costUsd, costCredits } = estimateRankCheckCredits(
    keywords,
    devices,
    depth,
    "queued",
  );
  const checksPerMonth = scheduledChecksPerMonth(scheduleInterval);
  return {
    scheduleInterval,
    costUsd,
    costCredits,
    checksPerMonth,
    monthlyCostUsd: costUsd * checksPerMonth,
    monthlyCostCredits: costCredits * checksPerMonth,
  };
}

/** Planning figure for monthly cost estimates, not a calendar count. */
export function scheduledChecksPerMonth(
  scheduleInterval: ScheduledRankTrackingInterval,
) {
  return scheduleInterval === "daily"
    ? 30
    : scheduleInterval === "weekly"
      ? 4
      : 1;
}

export function isScheduledRankTrackingInterval(
  interval: RankTrackingConfig["scheduleInterval"],
): interval is ScheduledRankTrackingInterval {
  return interval !== "manual";
}

/**
 * Monthly checks run on the last day of the month where the user is. That day
 * can fall on a neighbouring UTC date, so the anchor sits `dayShift` days from
 * the UTC month end: -1, 0, or +1.
 */
function monthEndWithTime(
  year: number,
  month: number,
  dayShift: number,
  time: { hour: number; minute: number },
): Date {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month + 1, dayShift, time.hour, time.minute));
}

/**
 * Read the day shift back off a stored monthly anchor, so advancing it keeps
 * the same relation to the month end without a column for it. Months have at
 * least 28 days, so the 1st, the last day, and the day before never collide.
 */
function monthlyAnchorDayShift(anchor: Date): number {
  if (anchor.getUTCDate() === 1) return 1;
  const lastDay = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return anchor.getUTCDate() === lastDay - 1 ? -1 : 0;
}

type UtcScheduleTime = {
  weekday?: number;
  hour: number;
  minute: number;
  /** Days the chosen date moved when converting to UTC: -1, 0, or +1. */
  dayShift: number;
};

/**
 * Shift a chosen time from its timezone to UTC, weekday included. Uses the
 * zone's offset right now: the anchor is fixed in UTC afterwards anyway, so a
 * pick made just before a clock change is an hour off from its first run on.
 */
function scheduleTimeInUtc(
  scheduleTime: RankCheckScheduleTime,
  now: number,
): UtcScheduleTime {
  if (!scheduleTime.timeZone) return { ...scheduleTime, dayShift: 0 };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: scheduleTime.timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  // The wall clock above has no seconds, so drop them from `now` too.
  const offsetMinutes = (wallClockAsUtc - now + (now % 60_000)) / 60_000;

  const utcMinutes =
    scheduleTime.hour * 60 + scheduleTime.minute - offsetMinutes;
  const dayShift = Math.floor(utcMinutes / 1440);
  const minutesOfDay = utcMinutes - dayShift * 1440;
  return {
    weekday:
      scheduleTime.weekday === undefined
        ? undefined
        : (scheduleTime.weekday + dayShift + 7) % 7,
    hour: Math.floor(minutesOfDay / 60),
    minute: minutesOfDay % 60,
    dayShift,
  };
}

/**
 * Compute the next check time for a scheduled config.
 *
 * If `previousNextCheckAt` is provided, advances from that anchor by the
 * interval until the result is in the future. This prevents schedule drift
 * when runs are delayed (e.g., a weekly config due Monday that fires on
 * Wednesday will still schedule the next check for the following Monday).
 *
 * Otherwise the first check lands on `chosenTime` when the user chose one, or
 * on a random hour (04–09 UTC) and minute. The random default spreads load
 * across the scheduler's ticks.
 */
export function computeNextCheckAt(
  interval: ScheduledRankTrackingInterval,
  previousNextCheckAt?: string | null,
  chosenTime?: RankCheckScheduleTime,
): string {
  const now = Date.now();
  const scheduleTime = chosenTime && scheduleTimeInUtc(chosenTime, now);

  if (interval === "monthly") {
    if (previousNextCheckAt) {
      const anchor = new Date(previousNextCheckAt);
      const year = anchor.getUTCFullYear();
      const dayShift = monthlyAnchorDayShift(anchor);
      const time = {
        hour: anchor.getUTCHours(),
        minute: anchor.getUTCMinutes(),
      };
      // A +1 anchor sits on the 1st, which belongs to the month before it.
      let month = anchor.getUTCMonth() + (dayShift === 1 ? 0 : 1);
      let nextDate = monthEndWithTime(year, month, dayShift, time);
      while (nextDate.getTime() <= now) {
        month += 1;
        nextDate = monthEndWithTime(year, month, dayShift, time);
      }
      return nextDate.toISOString();
    }

    const time = {
      hour: scheduleTime?.hour ?? 4 + Math.floor(Math.random() * 6),
      minute: scheduleTime?.minute ?? Math.floor(Math.random() * 60),
    };
    const dayShift = scheduleTime?.dayShift ?? 0;
    const today = new Date(now);
    const year = today.getUTCFullYear();
    // Start a month back: a +1 shift puts last month's run early in this one.
    let month = today.getUTCMonth() - 1;
    let nextDate = monthEndWithTime(year, month, dayShift, time);
    while (nextDate.getTime() <= now) {
      month += 1;
      nextDate = monthEndWithTime(year, month, dayShift, time);
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

  if (scheduleTime) {
    // Next occurrence of the chosen time, so a pick later today runs today.
    const nextDate = new Date(now);
    nextDate.setUTCHours(scheduleTime.hour, scheduleTime.minute, 0, 0);
    const weekday = interval === "weekly" ? scheduleTime.weekday : undefined;
    if (weekday !== undefined) {
      const daysUntilWeekday = (weekday - nextDate.getUTCDay() + 7) % 7;
      nextDate.setUTCDate(nextDate.getUTCDate() + daysUntilWeekday);
    }
    if (nextDate.getTime() <= now) {
      nextDate.setUTCDate(
        nextDate.getUTCDate() + (weekday === undefined ? 1 : 7),
      );
    }
    return nextDate.toISOString();
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
