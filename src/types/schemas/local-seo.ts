import { z } from "zod";

const projectId = z.string().min(1);
export const localBusinessSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    cid: z.string().min(1).max(64).nullable(),
    placeId: z.string().min(1).max(256).nullable(),
    address: z.string().max(1000).nullable(),
    latitude: z.number().min(-85).max(85),
    longitude: z.number().min(-180).max(180),
  })
  .refine(
    (value) => value.cid != null || value.placeId != null,
    "Choose a Google Maps listing with a CID or place ID.",
  );

export const localProjectSchema = z.object({ projectId });
export const localTrackerIdSchema = localProjectSchema.extend({
  trackerId: z.uuid(),
});
export const localScanIdSchema = localProjectSchema.extend({
  scanId: z.uuid(),
});
export const localLookupSchema = localProjectSchema.extend({
  query: z.string().trim().min(2).max(200),
  /** A DataForSEO location name from the city search, e.g. "Pittsburgh,Pennsylvania,United States". */
  locationName: z.string().trim().min(1).max(200),
});
export const MAX_LOCAL_KEYWORDS = 20;
export const MAX_LOCAL_KEYWORD_LENGTH = 120;
const localKeywordsSchema = z
  .array(z.string().trim().min(1).max(MAX_LOCAL_KEYWORD_LENGTH))
  .max(MAX_LOCAL_KEYWORDS);
export const updateLocalKeywordsSchema = localTrackerIdSchema.extend({
  keywords: localKeywordsSchema,
});
export const createLocalTrackerSchema = localProjectSchema.extend({
  business: localBusinessSchema,
  keywords: localKeywordsSchema,
  gridSize: z.union([z.literal(3), z.literal(5)]),
  spacingKm: z.number().min(0.25).max(10),
});
export const startLocalCheckSchema = localTrackerIdSchema.extend({
  requestId: z.uuid(),
  maxCostCredits: z.number().int().nonnegative(),
});
