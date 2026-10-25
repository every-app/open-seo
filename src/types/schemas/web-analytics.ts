import { z } from "zod";

export const WEB_ANALYTICS_PERIODS = ["today", "7d", "30d", "90d"] as const;
export type WebAnalyticsPeriod = (typeof WEB_ANALYTICS_PERIODS)[number];

export const webAnalyticsPeriodSchema = z.enum(WEB_ANALYTICS_PERIODS);

// Dimensions the breakdown endpoint accepts. Session dimensions group on the
// denormalized session row; page/goal/exit_link group on events.
export const WEB_ANALYTICS_DIMENSIONS = [
  "page",
  "entry_page",
  "exit_page",
  "source",
  "channel",
  "country",
  "region",
  "city",
  "browser",
  "os",
  "device",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "goal",
  "exit_link",
] as const;
export type WebAnalyticsDimension = (typeof WEB_ANALYTICS_DIMENSIONS)[number];

export const webAnalyticsDimensionSchema = z.enum(WEB_ANALYTICS_DIMENSIONS);

export const webAnalyticsSearchSchema = z.object({
  period: webAnalyticsPeriodSchema.default("30d"),
});
