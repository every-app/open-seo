import { z } from "zod";
import {
  optionalSearchNumberParam,
  optionalSearchPositiveIntParam,
  searchTextParam,
} from "@/types/schemas/domain";

// Kept apart from rank-tracking.ts, which reads enums off the Drizzle table
// and would pull the database schema into the client route bundle.

export const comparePeriodSchema = z.enum(["1d", "7d", "30d", "90d"]);
export type ComparePeriod = z.infer<typeof comparePeriodSchema>;

/** /p/$projectId/rank-tracking query params: the domain list filters. */
export const rankTrackingListSearchSchema = z.object({
  q: searchTextParam,
  device: z.enum(["both", "desktop", "mobile"]).optional().catch(undefined),
  loc: optionalSearchPositiveIntParam,
});

export type RankTrackingListSearch = z.infer<
  typeof rankTrackingListSearchSchema
>;

/** /p/$projectId/rank-tracking/$configId query params. */
export const rankTrackingDetailSearchSchema = z.object({
  view: z.literal("history").optional().catch(undefined),
  device: z.enum(["desktop", "mobile"]).optional().catch(undefined),
  compare: comparePeriodSchema.optional().catch(undefined),
  sort: z
    .enum([
      "keyword",
      "desktopPosition",
      "mobilePosition",
      "volume",
      "kd",
      "cpc",
    ])
    .optional()
    .catch(undefined),
  order: z.enum(["asc", "desc"]).optional().catch(undefined),
  include: searchTextParam,
  exclude: searchTextParam,
  minDesktopPos: optionalSearchNumberParam,
  maxDesktopPos: optionalSearchNumberParam,
  minMobilePos: optionalSearchNumberParam,
  maxMobilePos: optionalSearchNumberParam,
  minVolume: optionalSearchNumberParam,
  maxVolume: optionalSearchNumberParam,
  minKd: optionalSearchNumberParam,
  maxKd: optionalSearchNumberParam,
  minCpc: optionalSearchNumberParam,
  maxCpc: optionalSearchNumberParam,
});

export type RankTrackingDetailSearch = z.infer<
  typeof rankTrackingDetailSearchSchema
>;
