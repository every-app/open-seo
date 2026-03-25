import {
  DataforseoLabsApi,
  DataforseoLabsGoogleRelatedKeywordsLiveRequestInfo,
  DataforseoLabsGoogleKeywordSuggestionsLiveRequestInfo,
  DataforseoLabsGoogleKeywordIdeasLiveRequestInfo,
  DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo,
  DataforseoLabsGoogleRankedKeywordsLiveRequestInfo,
} from "dataforseo-client";
import { env } from "cloudflare:workers";
import { getDomain } from "tldts";
import type { DataforseoApiResponse } from "@/server/lib/dataforseoCost";
import { AppError } from "@/server/lib/errors";
import {
  dataforseoResponseSchema,
  domainMetricsItemSchema,
  domainRankedKeywordItemSchema,
  labsKeywordDataItemSchema,
  parseTaskItems,
  relatedKeywordItemSchema,
  serpSnapshotItemSchema,
  type DataforseoTask,
  type DomainMetricsItem,
  type DomainRankedKeywordItem,
  type LabsKeywordDataItem,
  type RelatedKeywordItem,
  type SerpLiveItem,
  successfulDataforseoTaskSchema,
} from "@/server/lib/dataforseoSchemas";
export type {
  DomainRankedKeywordItem,
  LabsKeywordDataItem,
  SerpLiveItem,
} from "@/server/lib/dataforseoSchemas";

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

async function postDataforseo(
  path: string,
  payload: unknown,
): Promise<unknown> {
  const authenticatedFetch = createAuthenticatedFetch();
  const response = await authenticatedFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO HTTP ${response.status} on ${path}`,
    );
  }

  return await response.json();
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the top-level response and first task both succeeded.
 * Throws a descriptive error on failure. Returns the first task.
 */
type DataforseoTaskLike = {
  status_code?: number;
  status_message?: string;
  path?: string[];
  cost?: number;
  result_count?: number | null;
  result?: DataforseoTask["result"];
};

function assertOk<T extends DataforseoTaskLike>(
  response: {
    status_code?: number;
    status_message?: string;
    tasks?: T[];
  } | null,
): DataforseoTask {
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

  const parsedTask = successfulDataforseoTaskSchema.safeParse(task);
  if (!parsedTask.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO task missing billing metadata",
    );
  }

  return parsedTask.data;
}

function buildTaskBilling(task: DataforseoTask) {
  return {
    path: task.path,
    costUsd: task.cost,
    resultCount: task.result_count,
  };
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
): Promise<DataforseoApiResponse<RelatedKeywordItem[]>> {
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

  const endpoint = "google-related-keywords-live";
  const response = await api.googleRelatedKeywordsLive([req]);
  const task = assertOk(response);
  const data = parseTaskItems(endpoint, task, relatedKeywordItemSchema);

  return {
    data,
    billing: buildTaskBilling(task),
  };
}

export async function fetchKeywordSuggestionsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<DataforseoApiResponse<LabsKeywordDataItem[]>> {
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

  const endpoint = "google-keyword-suggestions-live";
  const response = await api.googleKeywordSuggestionsLive([req]);
  const task = assertOk(response);
  const data = parseTaskItems(endpoint, task, labsKeywordDataItemSchema);

  return {
    data,
    billing: buildTaskBilling(task),
  };
}

export async function fetchKeywordIdeasRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<DataforseoApiResponse<LabsKeywordDataItem[]>> {
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

  const endpoint = "google-keyword-ideas-live";
  const response = await api.googleKeywordIdeasLive([req]);
  const task = assertOk(response);
  const data = parseTaskItems(endpoint, task, labsKeywordDataItemSchema);

  return {
    data,
    billing: buildTaskBilling(task),
  };
}

// ---------------------------------------------------------------------------
// Domain API wrappers
// ---------------------------------------------------------------------------

export async function fetchDomainRankOverviewRaw(
  target: string,
  locationCode: number,
  languageCode: string,
): Promise<DataforseoApiResponse<DomainMetricsItem[]>> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo({
    target,
    location_code: locationCode,
    language_code: languageCode,
    limit: 1,
  });

  const endpoint = "google-domain-rank-overview-live";
  const response = await api.googleDomainRankOverviewLive([req]);
  const task = assertOk(response);
  const data = parseTaskItems(endpoint, task, domainMetricsItemSchema);

  return {
    data,
    billing: buildTaskBilling(task),
  };
}

export async function fetchRankedKeywordsRaw(
  target: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  orderBy?: string[],
): Promise<DataforseoApiResponse<DomainRankedKeywordItem[]>> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleRankedKeywordsLiveRequestInfo({
    target,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    order_by: orderBy,
  });

  const endpoint = "google-ranked-keywords-live";
  const response = await api.googleRankedKeywordsLive([req]);
  const task = assertOk(response);
  const data = parseTaskItems(endpoint, task, domainRankedKeywordItemSchema);

  return {
    data,
    billing: buildTaskBilling(task),
  };
}

// ---------------------------------------------------------------------------
// SERP Analysis API wrapper (Google Organic Live)
// ---------------------------------------------------------------------------

export async function fetchLiveSerpItemsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
): Promise<DataforseoApiResponse<SerpLiveItem[]>> {
  const responseRaw = await postDataforseo(
    "/v3/serp/google/organic/live/advanced",
    [
      {
        keyword,
        location_code: locationCode,
        language_code: languageCode,
        device: "desktop",
        os: "windows",
        depth: 100,
      },
    ],
  );
  const response = dataforseoResponseSchema.parse(responseRaw);
  const endpoint = "google-organic-live-advanced";
  const task = assertOk(response);
  const data = parseTaskItems(endpoint, task, serpSnapshotItemSchema);

  return {
    data,
    billing: buildTaskBilling(task),
  };
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

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new AppError("VALIDATION_ERROR", "Domain is invalid");
  }

  if (!host) {
    throw new AppError("VALIDATION_ERROR", "Domain is invalid");
  }

  if (includeSubdomains) {
    return host;
  }

  return getDomain(host) ?? host;
}
