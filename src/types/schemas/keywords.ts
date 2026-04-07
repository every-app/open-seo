import { z } from "zod";

export const researchKeywordsSchema = z.object({
  projectId: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1).max(200),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
  resultLimit: z
    .union([z.literal(150), z.literal(300), z.literal(500)])
    .default(150),
  mode: z
    .enum(["auto", "related", "suggestions", "ideas"])
    .optional()
    .default("auto"),
});

export const saveKeywordsSchema = z.object({
  projectId: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1).max(500),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
  metrics: z
    .array(
      z.object({
        keyword: z.string().min(1),
        searchVolume: z.number().int().nonnegative().nullable().optional(),
        cpc: z.number().nonnegative().nullable().optional(),
        competition: z.number().min(0).max(1).nullable().optional(),
        keywordDifficulty: z
          .number()
          .int()
          .min(0)
          .max(100)
          .nullable()
          .optional(),
        intent: z
          .enum([
            "informational",
            "commercial",
            "transactional",
            "navigational",
            "unknown",
          ])
          .nullable()
          .optional(),
        monthlySearches: z
          .array(
            z.object({
              year: z.number().int().positive(),
              month: z.number().int().min(1).max(12),
              searchVolume: z.number().int().nonnegative(),
            }),
          )
          .optional(),
      }),
    )
    .max(500)
    .optional(),
});

export const removeSavedKeywordSchema = z.object({
  projectId: z.string().min(1),
  savedKeywordId: z.string().min(1),
});

export const getSavedKeywordsSchema = z.object({
  projectId: z.string().min(1),
});

export type ResearchKeywordsInput = z.infer<typeof researchKeywordsSchema>;
export type SaveKeywordsInput = z.infer<typeof saveKeywordsSchema>;
export type RemoveSavedKeywordInput = z.infer<typeof removeSavedKeywordSchema>;
export const serpAnalysisSchema = z.object({
  projectId: z.string().min(1),
  keyword: z.string().min(1),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
});

export type GetSavedKeywordsInput = z.infer<typeof getSavedKeywordsSchema>;

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/keywords                */
/* ------------------------------------------------------------------ */

const keywordSortFields = [
  "keyword",
  "searchVolume",
  "cpc",
  "competition",
  "keywordDifficulty",
] as const;

const sortDirs = ["asc", "desc"] as const;
const keywordModes = ["auto", "related", "suggestions", "ideas"] as const;

export const keywordsSearchSchema = z.object({
  q: z.string().optional(),
  loc: z.coerce.number().int().positive().optional(),
  kLimit: z.union([z.literal(150), z.literal(300), z.literal(500)]).optional(),
  mode: z.enum(keywordModes).optional(),
  sort: z.enum(keywordSortFields).optional(),
  order: z.enum(sortDirs).optional(),
  minVol: z.string().optional(),
  maxVol: z.string().optional(),
  minCpc: z.string().optional(),
  maxCpc: z.string().optional(),
  minKd: z.string().optional(),
  maxKd: z.string().optional(),
  include: z.string().optional(),
  exclude: z.string().optional(),
});
