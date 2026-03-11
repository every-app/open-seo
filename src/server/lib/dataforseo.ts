import {
  DataforseoLabsApi,
  DataforseoLabsGoogleRelatedKeywordsLiveRequestInfo,
  DataforseoLabsGoogleKeywordSuggestionsLiveRequestInfo,
  DataforseoLabsGoogleKeywordIdeasLiveRequestInfo,
  DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo,
  DataforseoLabsGoogleRankedKeywordsLiveRequestInfo,
  DataforseoLabsGoogleHistoricalSerpsLiveRequestInfo,
} from "dataforseo-client";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";

// ---------------------------------------------------------------------------
// SDK client factories (lazily created per-request using the env secret)
// ---------------------------------------------------------------------------

function createAuthenticatedFetch() {
  return (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${env.DATAFORSEO_API_KEY}`);

    const newInit: RequestInit = {
      ...init,
      headers,
    };
    return fetch(url, newInit);
  };
}

const API_BASE = "https://api.dataforseo.com";

function getLabsApi() {
  return new DataforseoLabsApi(API_BASE, { fetch: createAuthenticatedFetch() });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the top-level response and first task both succeeded.
 * Throws a descriptive error on failure. Returns the first task.
 */
function assertOk<T extends { status_code?: number; status_message?: string }>(
  response: {
    status_code?: number;
    status_message?: string;
    tasks?: T[];
  } | null,
): T {
  if (!response) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an empty response",
    );
  }
  if (response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response.status_message || "DataForSEO request failed",
    );
  }
  const task = response.tasks?.[0];
  if (!task) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO response missing task");
  }
  if (task.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      task.status_message || "DataForSEO task failed",
    );
  }
  return task;
}

type DataforseoTaskResult = { items?: unknown[] };

type DataforseoTask = {
  status_code?: number;
  status_message?: string;
  result?: DataforseoTaskResult[];
};

function getTaskItems(task: DataforseoTask): unknown[] {
  return task.result?.[0]?.items ?? [];
}

const monthlySearchSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    search_volume: z.number().nullable(),
  })
  .passthrough();

const keywordInfoSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    competition: z.number().nullable().optional(),
    monthly_searches: z.array(monthlySearchSchema).nullable().optional(),
  })
  .passthrough();

const keywordInfoWithClickstreamSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    monthly_searches: z.array(monthlySearchSchema).nullable().optional(),
  })
  .passthrough();

const searchIntentInfoSchema = z
  .object({
    main_intent: z.string().nullable().optional(),
  })
  .passthrough();

const keywordPropertiesSchema = z
  .object({
    keyword_difficulty: z.number().nullable().optional(),
  })
  .passthrough();

const relatedKeywordItemSchema = z
  .object({
    keyword_data: z
      .object({
        keyword: z.string().optional(),
        keyword_info: keywordInfoSchema.optional(),
        keyword_info_normalized_with_clickstream:
          keywordInfoWithClickstreamSchema.optional(),
        search_intent_info: searchIntentInfoSchema.nullable().optional(),
        keyword_properties: keywordPropertiesSchema.nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const labsKeywordDataItemSchema = z
  .object({
    keyword: z.string(),
    keyword_info: keywordInfoSchema.optional(),
    keyword_info_normalized_with_clickstream:
      keywordInfoWithClickstreamSchema.optional(),
    search_intent_info: searchIntentInfoSchema.nullable().optional(),
    keyword_properties: keywordPropertiesSchema.nullable().optional(),
  })
  .passthrough();

const domainMetricsValueSchema = z
  .object({
    etv: z.number().nullable().optional(),
    count: z.number().nullable().optional(),
  })
  .passthrough();

const domainMetricsItemSchema = z
  .object({
    metrics: z.record(
      z.string(),
      domainMetricsValueSchema.nullable().optional(),
    ),
  })
  .passthrough();

const rankedKeywordInfoSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    keyword_difficulty: z.number().nullable().optional(),
  })
  .passthrough();

const rankedKeywordDataSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    keyword_info: rankedKeywordInfoSchema.nullable().optional(),
    keyword_properties: keywordPropertiesSchema.nullable().optional(),
  })
  .passthrough();

const rankedSerpItemSchema = z
  .object({
    url: z.string().nullable().optional(),
    relative_url: z.string().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    etv: z.number().nullable().optional(),
  })
  .passthrough();

const rankedSerpElementSchema = z
  .object({
    serp_item: rankedSerpItemSchema.nullable().optional(),
    url: z.string().nullable().optional(),
    relative_url: z.string().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    etv: z.number().nullable().optional(),
  })
  .passthrough();

const domainRankedKeywordItemSchema = z
  .object({
    keyword_data: rankedKeywordDataSchema.nullable().optional(),
    ranked_serp_element: rankedSerpElementSchema.nullable().optional(),
    keyword: z.string().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    etv: z.number().nullable().optional(),
    keyword_difficulty: z.number().nullable().optional(),
  })
  .passthrough();

const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    etv: z.number().nullable().optional(),
    estimated_paid_traffic_cost: z.number().nullable().optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rank_changes: z
      .object({
        previous_rank_absolute: z.number().nullable().optional(),
        is_new: z.boolean().nullable().optional(),
        is_up: z.boolean().nullable().optional(),
        is_down: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const serpSnapshotSchema = z
  .object({
    se_results_count: z.number().nullable().optional(),
    items_count: z.number().nullable().optional(),
    items: z.array(serpSnapshotItemSchema),
  })
  .passthrough();

type RelatedKeywordItem = z.infer<typeof relatedKeywordItemSchema>;
export type LabsKeywordDataItem = z.infer<typeof labsKeywordDataItemSchema>;
type DomainMetricsItem = z.infer<typeof domainMetricsItemSchema>;
export type DomainRankedKeywordItem = z.infer<
  typeof domainRankedKeywordItemSchema
>;
type SerpSnapshot = z.infer<typeof serpSnapshotSchema>;

function parseTaskItems<T extends z.ZodType>(
  endpointName: string,
  task: DataforseoTask,
  itemSchema: T,
): z.infer<T>[] {
  const parsed = z.array(itemSchema).safeParse(getTaskItems(task));
  if (!parsed.success) {
    console.error(
      `dataforseo.${endpointName}.invalid-payload`,
      parsed.error.issues.slice(0, 5),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${endpointName} returned an invalid response shape`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// DataForSEO Labs API wrappers
// ---------------------------------------------------------------------------

export async function fetchRelatedKeywordsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  depth: number = 3,
): Promise<RelatedKeywordItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleRelatedKeywordsLiveRequestInfo({
    keyword,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    depth,
    include_clickstream_data: true,
    include_serp_info: false,
  });

  const response = await api.googleRelatedKeywordsLive([req]);
  const task = assertOk<DataforseoTask>(response);
  return parseTaskItems(
    "google-related-keywords-live",
    task,
    relatedKeywordItemSchema,
  );
}

export async function fetchKeywordSuggestionsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<LabsKeywordDataItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleKeywordSuggestionsLiveRequestInfo({
    keyword,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    include_clickstream_data: true,
    include_serp_info: false,
    include_seed_keyword: true,
    ignore_synonyms: false,
    exact_match: false,
  });

  const response = await api.googleKeywordSuggestionsLive([req]);
  const task = assertOk<DataforseoTask>(response);
  return parseTaskItems(
    "google-keyword-suggestions-live",
    task,
    labsKeywordDataItemSchema,
  );
}

export async function fetchKeywordIdeasRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<LabsKeywordDataItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleKeywordIdeasLiveRequestInfo({
    keywords: [keyword],
    location_code: locationCode,
    language_code: languageCode,
    limit,
    include_clickstream_data: true,
    include_serp_info: false,
    ignore_synonyms: false,
    closely_variants: false,
  });

  const response = await api.googleKeywordIdeasLive([req]);
  const task = assertOk<DataforseoTask>(response);
  return parseTaskItems(
    "google-keyword-ideas-live",
    task,
    labsKeywordDataItemSchema,
  );
}

// ---------------------------------------------------------------------------
// Domain API wrappers
// ---------------------------------------------------------------------------

export async function fetchDomainRankOverviewRaw(
  target: string,
  locationCode: number,
  languageCode: string,
): Promise<DomainMetricsItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo({
    target,
    location_code: locationCode,
    language_code: languageCode,
    limit: 1,
  });

  const response = await api.googleDomainRankOverviewLive([req]);
  const task = assertOk<DataforseoTask>(response);
  return parseTaskItems(
    "google-domain-rank-overview-live",
    task,
    domainMetricsItemSchema,
  );
}

export async function fetchRankedKeywordsRaw(
  target: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  orderBy?: string[],
): Promise<DomainRankedKeywordItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleRankedKeywordsLiveRequestInfo({
    target,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    order_by: orderBy,
  });

  const response = await api.googleRankedKeywordsLive([req]);
  const task = assertOk<DataforseoTask>(response);
  return parseTaskItems(
    "google-ranked-keywords-live",
    task,
    domainRankedKeywordItemSchema,
  );
}

// ---------------------------------------------------------------------------
// SERP Analysis API wrapper
// ---------------------------------------------------------------------------

export async function fetchHistoricalSerpsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
): Promise<SerpSnapshot[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleHistoricalSerpsLiveRequestInfo({
    keyword,
    location_code: locationCode,
    language_code: languageCode,
  });

  const response = await api.googleHistoricalSerpsLive([req]);
  const task = assertOk<DataforseoTask>(response);
  return parseTaskItems(
    "google-historical-serps-live",
    task,
    serpSnapshotSchema,
  );
}

// ---------------------------------------------------------------------------
// Domain utility functions (unchanged)
// ---------------------------------------------------------------------------

export function toRelativePath(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return null;
  }
}

export function normalizeDomainInput(
  input: string,
  includeSubdomains: boolean,
): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "Domain is required");
  }

  const withProtocol = /^https?:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const host = new URL(withProtocol).hostname.replace(/^www\./, "");

  if (includeSubdomains) {
    return host;
  }

  return toRootDomain(host);
}

function toRootDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const knownSecondLevel = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "co.jp",
  ]);
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  const lastThree = `${parts[parts.length - 3]}.${lastTwo}`;

  if (knownSecondLevel.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }

  return lastTwo;
}
