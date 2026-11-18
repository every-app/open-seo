import { z } from "zod";

const localMapScheduleIntervalSchema = z.enum(["weekly", "monthly", "manual"]);

const projectIdSchema = z.object({
  projectId: z.string().min(1),
});

const oddGridSize = z
  .number()
  .int()
  .min(3)
  .max(15)
  .refine((n) => n % 2 === 1, { message: "gridSize must be odd" });

export const getLocalMapCampaignsSchema = projectIdSchema;

export const createLocalMapCampaignSchema = projectIdSchema.extend({
  name: z.string().min(1).max(120),
  centerLatitude: z.number().min(-90).max(90),
  centerLongitude: z.number().min(-180).max(180),
  gridSize: oddGridSize,
  radiusKm: z.number().min(0.5).max(50),
  targetPlaceId: z.string().max(256).optional(),
  targetCid: z.string().max(64).optional(),
  languageCode: z.string().min(2).max(10).default("en"),
  device: z.enum(["desktop", "mobile"]).default("mobile"),
  scheduleInterval: localMapScheduleIntervalSchema.default("weekly"),
  serpDepth: z.number().int().min(10).max(100).default(20),
  keywords: z.array(z.string().min(1).max(700)).min(1).max(20),
});

export const localMapCampaignIdSchema = projectIdSchema.extend({
  campaignId: z.string().uuid(),
});

export const getLocalMapRunResultsSchema = projectIdSchema.extend({
  runId: z.string().uuid(),
});
