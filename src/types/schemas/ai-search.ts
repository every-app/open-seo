import { z } from "zod";

/**
 * Input + output schemas for the AI Search feature (Brand Lookup + Prompt
 * Explorer). These two pages are fully stateless — the user types something,
 * we hit DataForSEO, and we render. Schemas live here so they can be reused
 * by server functions, services, R2 cache validation, and the client UI.
 */

// ---------------------------------------------------------------------------
// AI Search access setup (self-hosted mode only)
// ---------------------------------------------------------------------------

export const aiSearchProjectSchema = z.object({
  projectId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Brand Lookup
// ---------------------------------------------------------------------------

/** Maximum allowed length for a free-text brand or domain search input. */
export const BRAND_LOOKUP_MAX_INPUT_LENGTH = 250;

export const brandLookupInputSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().trim().min(1).max(BRAND_LOOKUP_MAX_INPUT_LENGTH),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
});

export type BrandLookupInput = z.infer<typeof brandLookupInputSchema>;

const brandPlatformBreakdownSchema = z.object({
  platform: z.enum(["chat_gpt", "google"]),
  status: z.enum(["success", "error"]),
  mentions: z.number().int().nonnegative().nullable(),
  aiSearchVolume: z.number().int().nonnegative().nullable(),
  impressions: z.number().int().nonnegative().nullable(),
});

const brandTopPageSchema = z.object({
  url: z.string(),
  domain: z.string().nullable(),
  mentions: z.number().int().nonnegative().nullable(),
  platform: z.enum(["chat_gpt", "google"]),
});

const brandTopQuerySchema = z.object({
  question: z.string(),
  platform: z.enum(["chat_gpt", "google"]),
  aiSearchVolume: z.number().int().nonnegative().nullable(),
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  citedSources: z
    .array(
      z.object({
        url: z.string(),
        domain: z.string().nullable(),
        title: z.string().nullable(),
      }),
    )
    .max(10),
  brandsMentioned: z.array(z.string()).max(20),
});

const brandMonthlyVolumeSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  volume: z.number().int().nonnegative().nullable(),
});

export const brandLookupResultSchema = z.object({
  query: z.string(),
  detectedTargetType: z.enum(["domain", "keyword"]),
  resolvedTarget: z.string(),
  fetchedAt: z.string(),
  hasData: z.boolean(),
  totalMentions: z.number().int().nonnegative().nullable(),
  totalAiSearchVolume: z.number().int().nonnegative().nullable(),
  totalImpressions: z.number().int().nonnegative().nullable(),
  perPlatform: z.array(brandPlatformBreakdownSchema),
  topPages: z.array(brandTopPageSchema).max(20),
  topQueries: z.array(brandTopQuerySchema).max(50),
  monthlyVolume: z.array(brandMonthlyVolumeSchema),
});

export type BrandLookupResult = z.infer<typeof brandLookupResultSchema>;

// ---------------------------------------------------------------------------
// Prompt Explorer
// ---------------------------------------------------------------------------

export const PROMPT_EXPLORER_MAX_PROMPT_LENGTH = 500;

/** Stable identifiers for the four LLM models we expose. */
export const PROMPT_EXPLORER_MODELS = [
  "chat_gpt",
  "claude",
  "gemini",
  "perplexity",
] as const;

export const promptExplorerModelSchema = z.enum(PROMPT_EXPLORER_MODELS);
export type PromptExplorerModel = z.infer<typeof promptExplorerModelSchema>;

/**
 * Two-letter ISO country code passed as `web_search_country_iso_code` to each
 * LLM Responses endpoint. Affects the web-search component of the answer
 * (Perplexity, GPT-5, Gemini, Claude when web search is on). DataForSEO
 * accepts any ISO-2 for ChatGPT/Gemini; Claude/Perplexity have a finite
 * supported list. We only expose codes covered by all four.
 */
export const WEB_SEARCH_COUNTRY_CODES = [
  "US",
  "GB",
  "CA",
  "AU",
  "IE",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "PT",
  "PL",
  "SE",
  "NO",
  "DK",
  "BR",
  "MX",
  "IN",
  "JP",
  "KR",
  "SG",
  "HK",
  "TW",
  "ZA",
] as const;

export const webSearchCountryCodeSchema = z.enum(WEB_SEARCH_COUNTRY_CODES);
export type WebSearchCountryCode = z.infer<typeof webSearchCountryCodeSchema>;

export const promptExplorerInputSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().trim().min(1).max(PROMPT_EXPLORER_MAX_PROMPT_LENGTH),
  models: z.array(promptExplorerModelSchema).min(1).max(4),
  highlightBrand: z
    .string()
    .trim()
    .min(1)
    .max(BRAND_LOOKUP_MAX_INPUT_LENGTH)
    .optional(),
  webSearch: z.boolean().default(true),
  webSearchCountryCode: webSearchCountryCodeSchema.optional(),
});

export type PromptExplorerInput = z.infer<typeof promptExplorerInputSchema>;

const promptExplorerCitationSchema = z.object({
  url: z.string(),
  domain: z.string().nullable(),
  title: z.string().nullable(),
  matchedBrand: z.boolean(),
});

export type PromptExplorerCitation = z.infer<
  typeof promptExplorerCitationSchema
>;

export const promptExplorerModelResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    model: promptExplorerModelSchema,
    modelName: z.string().nullable(),
    text: z.string(),
    citations: z.array(promptExplorerCitationSchema),
    fanOutQueries: z.array(z.string()),
    brandMentioned: z.boolean().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    webSearch: z.boolean(),
  }),
  z.object({
    status: z.literal("error"),
    model: promptExplorerModelSchema,
    errorCode: z.literal("UPSTREAM_ERROR"),
    message: z.string(),
  }),
]);

export type PromptExplorerModelResult = z.infer<
  typeof promptExplorerModelResultSchema
>;

export const promptExplorerResultSchema = z.object({
  prompt: z.string(),
  highlightBrand: z.string().nullable(),
  fetchedAt: z.string(),
  results: z.array(promptExplorerModelResultSchema),
});

export type PromptExplorerResult = z.infer<typeof promptExplorerResultSchema>;

// ---------------------------------------------------------------------------
// URL search params
// ---------------------------------------------------------------------------

/** /p/$projectId/brand-lookup query params — `q` keeps the lookup shareable. */
export const brandLookupSearchSchema = z.object({
  q: z.string().optional(),
});
