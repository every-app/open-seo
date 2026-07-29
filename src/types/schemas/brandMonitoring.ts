import { z } from "zod";

export const createBrandMonitorConfigSchema = z.object({
  query: z.string().min(2).max(200),
});

export const listBrandMonitorConfigsSchema = z.object({});

export const refreshBrandMentionsSchema = z.object({
  configId: z.string(),
});

export const getBrandMentionsSchema = z.object({
  configId: z.string(),
  sentimentFilter: z
    .enum(["all", "positive", "neutral", "negative"])
    .optional()
    .default("all"),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
