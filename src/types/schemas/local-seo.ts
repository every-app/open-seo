import { z } from "zod";
import { localGridConfigs } from "@/db/schema";
import { LOCAL_GRID_SIZES } from "@/shared/local-seo";

const latitude = z.number().finite().min(-85).max(85);
const longitude = z.number().finite().min(-180).max(180);
const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const localBusinessInputSchema = z
  .object({
    placeId: nullableText(500),
    cid: nullableText(100),
    featureId: nullableText(200),
    name: z.string().trim().min(1).max(200),
    address: nullableText(500),
    phone: nullableText(100),
    website: nullableText(2_000),
    primaryCategory: nullableText(200),
    latitude,
    longitude,
    rating: z.number().min(0).max(5).nullable().optional(),
    reviewCount: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((value) => value.placeId || value.cid || value.featureId, {
    message: "A confirmed Google place_id, cid, or feature_id is required",
  });

const configFields = {
  name: z.string().trim().min(1).max(120),
  centerLatitude: latitude.optional(),
  centerLongitude: longitude.optional(),
  gridSize: z.union(LOCAL_GRID_SIZES.map((value) => z.literal(value))),
  radiusMeters: z.number().int().min(100).max(100_000),
  distanceUnit: z.enum(localGridConfigs.distanceUnit.enumValues),
  languageCode: z.string().trim().min(2).max(10),
  seDomain: z.string().trim().min(3).max(100),
  searchDepth: z.number().int().min(10).max(100).multipleOf(10),
  searchPlaces: z.boolean(),
  scheduleInterval: z.enum(localGridConfigs.scheduleInterval.enumValues),
  isActive: z.boolean(),
};

const keywords = z.array(z.string().trim().min(1).max(200)).min(1).max(50);

export const listLocalGridConfigsSchema = z.object({
  projectId: z.string().uuid(),
});

export const getLocalGridConfigSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
});

export const createLocalGridConfigSchema = z.object({
  projectId: z.string().uuid(),
  business: localBusinessInputSchema,
  name: configFields.name,
  centerLatitude: configFields.centerLatitude,
  centerLongitude: configFields.centerLongitude,
  gridSize: configFields.gridSize.default(7),
  radiusMeters: configFields.radiusMeters.default(4_828),
  distanceUnit: configFields.distanceUnit.default("mi"),
  languageCode: configFields.languageCode.default("en"),
  seDomain: configFields.seDomain.default("google.co.uk"),
  searchDepth: configFields.searchDepth.default(20),
  searchPlaces: configFields.searchPlaces.default(false),
  scheduleInterval: configFields.scheduleInterval.default("weekly"),
  keywords,
});

export const updateLocalGridConfigSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
  name: configFields.name.optional(),
  centerLatitude: latitude.optional(),
  centerLongitude: longitude.optional(),
  gridSize: configFields.gridSize.optional(),
  radiusMeters: configFields.radiusMeters.optional(),
  distanceUnit: configFields.distanceUnit.optional(),
  languageCode: configFields.languageCode.optional(),
  seDomain: configFields.seDomain.optional(),
  searchDepth: configFields.searchDepth.optional(),
  searchPlaces: configFields.searchPlaces.optional(),
  scheduleInterval: configFields.scheduleInterval.optional(),
  isActive: configFields.isActive.optional(),
  keywords: keywords.optional(),
});

export const archiveLocalGridConfigSchema = z.object({
  projectId: z.string().uuid(),
  configId: z.string().uuid(),
});
