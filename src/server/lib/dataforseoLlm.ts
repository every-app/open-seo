import { z } from "zod";
import {
  llmAggregatedTotalSchema,
  llmMentionItemSchema,
  llmResponseEnvelopeSchema,
  llmResponseResultSchema,
  llmTopPagesItemSchema,
  type LlmAggregatedTotal,
  type LlmDataforseoTask,
  type LlmMentionItem,
  type LlmResponseResult,
  type LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import type { DataforseoApiResponse } from "@/server/lib/dataforseoCost";
import { createDataforseoAccessClassifier } from "@/server/lib/dataforseoAccessClassification";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

/**
 * Raw HTTP wrappers for DataForSEO AI Optimization endpoints.
 *
 * The official `dataforseo-client` SDK doesn't ship typed bindings for these
 * endpoints yet, so we POST raw JSON. Every wrapper returns billing metadata
 * alongside parsed data so the calling client can meter usage with Autumn.
 */

const API_BASE = "https://api.dataforseo.com";
const MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH = 1600;

// ChatGPT mention/response data is only available for US/en per DataForSEO docs.
export const CHATGPT_LOCATION_CODE = 2840;
export const CHATGPT_LANGUAGE_CODE = "en";

export type LlmPlatform = "chat_gpt" | "google";

// ---------------------------------------------------------------------------
// Shared HTTP / response handling
// ---------------------------------------------------------------------------

async function postLlm(path: string, payload: unknown): Promise<unknown> {
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw (
      classifyAiSearchError(response.status, rawText, path) ??
      new AppError(
        "INTERNAL_ERROR",
        `DataForSEO HTTP ${response.status} on ${path}. Response: ${truncate(rawText)}`,
      )
    );
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned non-JSON response: ${truncate(rawText)}`,
    );
  }
}

const classifyAiSearchError = createDataforseoAccessClassifier({
  pathPrefix: "/ai_optimization/",
  notEnabledCode: "AI_SEARCH_NOT_ENABLED",
  notEnabledMessage:
    "AI Optimization is not enabled for the connected DataForSEO account",
  billingIssueCode: "AI_SEARCH_BILLING_ISSUE",
  billingIssueMessage:
    "The connected DataForSEO account has a billing or balance issue",
});

function truncate(text: string): string {
  return text.length > MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH
    ? `${text.slice(0, MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH)}... [truncated]`
    : text;
}

function parseEnvelope(path: string, raw: unknown): LlmDataforseoTask {
  const envelope = llmResponseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned an invalid envelope: ${envelope.error.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join("; ")}`,
    );
  }

  const data = envelope.data;
  if (data.status_code !== 20000) {
    const message = data.status_message || `DataForSEO ${path} request failed`;
    throw (
      classifyAiSearchError(data.status_code, message, path) ??
      new AppError("INTERNAL_ERROR", message)
    );
  }

  const task = data.tasks?.[0];
  if (!task) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} response missing task`,
    );
  }

  if (task.status_code !== 20000) {
    const message = task.status_message || `DataForSEO ${path} task failed`;
    throw (
      classifyAiSearchError(task.status_code, message, path) ??
      new AppError("INTERNAL_ERROR", message)
    );
  }

  return task;
}

function buildBilling(task: LlmDataforseoTask) {
  return {
    path: task.path,
    costUsd: task.cost,
    resultCount: task.result_count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Target builders — DataForSEO's `target` array accepts domain OR keyword
// entries. We always pass exactly one target per call.
// ---------------------------------------------------------------------------

type LlmTarget =
  | {
      domain: string;
      include_subdomains?: boolean;
      search_filter?: "include" | "exclude";
      search_scope?: string[];
    }
  | {
      keyword: string;
      search_filter?: "include" | "exclude";
      search_scope?: string[];
      match_type?: "word_match" | "partial_match";
    };

export function buildLlmTarget(input: {
  type: "domain" | "keyword";
  value: string;
}): LlmTarget {
  if (input.type === "domain") {
    return {
      domain: input.value,
      include_subdomains: true,
      search_filter: "include",
      search_scope: ["any"],
    };
  }
  return {
    keyword: input.value,
    search_filter: "include",
    search_scope: ["any", "brand_entities"],
    match_type: "word_match",
  };
}

// ---------------------------------------------------------------------------
// LLM Mentions Search Live
// ---------------------------------------------------------------------------

export type LlmMentionsSearchInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  limit?: number;
};

export async function fetchLlmMentionsSearchRaw(
  input: LlmMentionsSearchInput,
): Promise<DataforseoApiResponse<LlmMentionItem[]>> {
  const path = "/v3/ai_optimization/llm_mentions/search/live";
  const payload = [
    {
      target: [input.target],
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: clampLimit(input.limit ?? 100, 1, 1000),
    },
  ];

  const raw = await postLlm(path, payload);
  const task = parseEnvelope(path, raw);

  const items = z
    .array(llmMentionItemSchema)
    .safeParse(extractItems(task.result));
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned an invalid mention items shape`,
    );
  }

  return { data: items.data, billing: buildBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Aggregated Metrics Live
// ---------------------------------------------------------------------------

export type LlmAggregatedMetricsInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  internalListLimit?: number;
};

export async function fetchLlmAggregatedMetricsRaw(
  input: LlmAggregatedMetricsInput,
): Promise<DataforseoApiResponse<LlmAggregatedTotal>> {
  const path = "/v3/ai_optimization/llm_mentions/aggregated_metrics/live";
  const payload = [
    {
      target: [input.target],
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      internal_list_limit: clampLimit(input.internalListLimit ?? 10, 1, 20),
    },
  ];

  const raw = await postLlm(path, payload);
  const task = parseEnvelope(path, raw);

  const totalRaw = extractFirstResult(task.result)?.total ?? {};
  const total = llmAggregatedTotalSchema.safeParse(totalRaw);
  if (!total.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned an invalid aggregated metrics shape`,
    );
  }

  return { data: total.data, billing: buildBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Top Pages Live
// ---------------------------------------------------------------------------

export type LlmTopPagesInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  itemsListLimit?: number;
};

export async function fetchLlmTopPagesRaw(
  input: LlmTopPagesInput,
): Promise<DataforseoApiResponse<LlmTopPagesItem[]>> {
  const path = "/v3/ai_optimization/llm_mentions/top_pages/live";
  const payload = [
    {
      target: [input.target],
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      links_scope: "sources",
      items_list_limit: clampLimit(input.itemsListLimit ?? 10, 1, 10),
      internal_list_limit: 5,
    },
  ];

  const raw = await postLlm(path, payload);
  const task = parseEnvelope(path, raw);

  const items = z
    .array(llmTopPagesItemSchema)
    .safeParse(extractFirstResult(task.result)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned an invalid top pages shape`,
    );
  }

  return { data: items.data, billing: buildBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Responses Live (per-model)
// ---------------------------------------------------------------------------

export type LlmResponseModelSlug =
  | "chat_gpt"
  | "claude"
  | "gemini"
  | "perplexity";

export type LlmResponsesInput = {
  userPrompt: string;
  modelSlug: LlmResponseModelSlug;
  modelName: string;
  webSearch?: boolean;
  maxOutputTokens?: number;
  /** Two-letter ISO country code used to geolocate the web-search component. */
  webSearchCountryCode?: string;
};

export async function fetchLlmResponseRaw(
  input: LlmResponsesInput,
): Promise<DataforseoApiResponse<LlmResponseResult>> {
  const path = `/v3/ai_optimization/${input.modelSlug}/llm_responses/live`;
  // DataForSEO's Gemini endpoint rejects `web_search_country_iso_code` with a
  // 40501 "Invalid Field" error. The other three models accept it.
  const supportsCountry = input.modelSlug !== "gemini";
  const payload = [
    {
      user_prompt: input.userPrompt,
      model_name: input.modelName,
      web_search: input.webSearch ?? true,
      max_output_tokens: clampLimit(input.maxOutputTokens ?? 1024, 256, 4096),
      ...(supportsCountry &&
        input.webSearchCountryCode && {
          web_search_country_iso_code: input.webSearchCountryCode,
        }),
    },
  ];

  const raw = await postLlm(path, payload);
  const task = parseEnvelope(path, raw);

  const first = extractFirstResult(task.result) as unknown;
  const result = llmResponseResultSchema.safeParse(first ?? {});
  if (!result.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned an invalid response shape`,
    );
  }

  return { data: result.data, billing: buildBilling(task) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function extractFirstResult(
  result: LlmDataforseoTask["result"],
): Record<string, unknown> | null {
  const first = result?.[0];
  return isRecord(first) ? first : null;
}

function extractItems(result: LlmDataforseoTask["result"]): unknown[] {
  const first = extractFirstResult(result);
  if (!first) return [];
  const items = first.items;
  return Array.isArray(items) ? items : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
