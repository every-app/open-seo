import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import { rankTrackingConfigs } from "@/db/app.schema";

// ---------------------------------------------------------------------------
// DB-derived types
// ---------------------------------------------------------------------------

export type RankTrackingConfig = InferSelectModel<typeof rankTrackingConfigs>;

// ---------------------------------------------------------------------------
// API / UI types
// ---------------------------------------------------------------------------

export type RankCheckTriggerResult =
  | {
      ok: true;
      runId: string;
    }
  | {
      ok: false;
      reason: "already_running";
      blockingRunId: string | null;
    };

export interface RankTrackingDeviceResult {
  position: number | null;
  previousPosition: number | null;
  rankingUrl: string | null;
  serpFeatures: string[];
}

export interface RankTrackingRow {
  trackingKeywordId: string;
  keyword: string;
  desktop: RankTrackingDeviceResult;
  mobile: RankTrackingDeviceResult;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const devicesEnum = z.enum(rankTrackingConfigs.devices.enumValues);
const scheduleEnum = z.enum(rankTrackingConfigs.scheduleInterval.enumValues);
export const getConfigsSchema = z.object({
  projectId: z.string().uuid(),
});

export const createConfigSchema = z.object({
  projectId: z.string().uuid(),
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
      "Invalid domain format",
    ),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().max(10).optional(),
  devices: devicesEnum.optional(),
  scheduleInterval: scheduleEnum.optional(),
});

export const updateConfigSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
      "Invalid domain format",
    )
    .optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().max(10).optional(),
  devices: devicesEnum.optional(),
  scheduleInterval: scheduleEnum.optional(),
  isActive: z.boolean().optional(),
});

export const triggerCheckSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).max(2000).optional(),
});

export const comparePeriodSchema = z.enum(["previous", "7d", "30d", "90d"]);
export type ComparePeriod = z.infer<typeof comparePeriodSchema>;

export const getLatestResultsSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
  comparePeriod: comparePeriodSchema.optional(),
});

export const getLatestRunSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
});

export const estimateCostSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
});

export const addKeywordsSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
  keywords: z.array(z.string().min(1).max(200)).min(1).max(2000),
});

export const removeKeywordsSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).min(1).max(2000),
});
