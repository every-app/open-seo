import { z } from "zod";
import { supportsWebSearchCountry } from "@/shared/prompt-search-countries";
import {
  llmAggregatedTotalSchema,
  llmCrossAggregatedItemSchema,
  llmMentionItemSchema,
  llmResponseResultSchema,
  llmTopPagesItemSchema,
  type LlmAggregatedTotal,
  type LlmCrossAggregatedItem,
  type LlmMentionItem,
  type LlmResponseResult,
  type LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";
import { AppError } from "@/server/lib/errors";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  isKnownLlmModelName,
  type LlmResponseModelSlug,
} from "@/server/lib/dataforseo/llm-models";
import type { LlmPlatform, LlmTarget } from "@/server/lib/dataforseo/shared";
import {
  assertOk,
  buildTaskBilling,
  isRecord,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

const classifyAiSearchError = createDataforseoBillingClassifier({
  pathPrefix: "/ai_optimization/",
  billingIssueCode: "AI_SEARCH_BILLING_ISSUE",
  billingIssueMessage:
    "The connected DataForSEO account has a billing or balance issue",
});

const assertOptions = (path: string) =>
  ({ classify: classifyAiSearchError, classifyPath: path }) as const;

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

// Request defaults shared with pricing.ts, whose estimates must reserve for
// what this module actually sends.
export function resolveLlmMentionsLimit(limit?: number): number {
  return clampLimit(limit ?? 100, 1, 1000);
}
export const LLM_RESPONSE_WEB_SEARCH_DEFAULT = true;

function targetList(target: LlmTarget): LlmTarget[] {
  return [target];
}

function firstResult(task: DataforseoTaskLike): Record<string, unknown> | null {
  const first = task.result?.[0];
  return isRecord(first) ? first : null;
}

// ---------------------------------------------------------------------------
// LLM Mentions Search
// ---------------------------------------------------------------------------

type LlmMentionsSearchInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  limit?: number;
  orderBy?: string[];
};

export async function fetchLlmMentionsSearch(
  input: LlmMentionsSearchInput,
): Promise<DataforseoApiResponse<LlmMentionItem[]>> {
  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/search/live",
    [
      {
        target: targetList(input.target),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        limit: resolveLlmMentionsLimit(input.limit),
        order_by: input.orderBy,
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions("/v3/ai_optimization/llm_mentions/search/live"),
  );

  const items = z
    .array(llmMentionItemSchema)
    .safeParse(firstResult(task)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/search returned an invalid mention items shape",
    );
  }
  return { data: items.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Aggregated Metrics
// ---------------------------------------------------------------------------

type LlmAggregatedMetricsInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  internalListLimit?: number;
};

export async function fetchLlmAggregatedMetrics(
  input: LlmAggregatedMetricsInput,
): Promise<DataforseoApiResponse<LlmAggregatedTotal>> {
  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/aggregated_metrics/live",
    [
      {
        target: targetList(input.target),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        internal_list_limit: clampLimit(input.internalListLimit ?? 10, 1, 20),
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions("/v3/ai_optimization/llm_mentions/aggregated_metrics/live"),
  );

  const total = llmAggregatedTotalSchema.safeParse(
    firstResult(task)?.total ?? {},
  );
  if (!total.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/aggregated_metrics returned an invalid shape",
    );
  }
  return { data: total.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Top Pages
// ---------------------------------------------------------------------------

type LlmTopPagesInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  itemsListLimit?: number;
};

export async function fetchLlmTopPages(
  input: LlmTopPagesInput,
): Promise<DataforseoApiResponse<LlmTopPagesItem[]>> {
  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/top_pages/live",
    [
      {
        target: targetList(input.target),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        links_scope: "sources",
        items_list_limit: clampLimit(input.itemsListLimit ?? 10, 1, 10),
        internal_list_limit: 5,
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions("/v3/ai_optimization/llm_mentions/top_pages/live"),
  );

  const items = z
    .array(llmTopPagesItemSchema)
    .safeParse(firstResult(task)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/top_pages returned an invalid shape",
    );
  }
  return { data: items.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Cross-Aggregated Metrics
// Compares 2..10 aggregation groups (target + competitors) in one call and
// returns one item per group, keyed by its aggregation_key (brand label).
// ---------------------------------------------------------------------------

type LlmCrossAggregatedMetricsInput = {
  groups: Array<{ key: string; target: LlmTarget }>;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  internalListLimit?: number;
};

export async function fetchLlmCrossAggregatedMetrics(
  input: LlmCrossAggregatedMetricsInput,
): Promise<DataforseoApiResponse<LlmCrossAggregatedItem[]>> {
  if (input.groups.length < 2 || input.groups.length > 10) {
    throw new AppError(
      "VALIDATION_ERROR",
      "DataForSEO llm_mentions/cross_aggregated_metrics requires 2 to 10 target groups",
    );
  }

  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/cross_aggregated_metrics/live",
    [
      {
        targets: input.groups.map((group) => ({
          aggregation_key: group.key,
          target: targetList(group.target),
        })),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        internal_list_limit: clampLimit(input.internalListLimit ?? 5, 1, 10),
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions(
      "/v3/ai_optimization/llm_mentions/cross_aggregated_metrics/live",
    ),
  );

  const items = z
    .array(llmCrossAggregatedItemSchema)
    .safeParse(firstResult(task)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/cross_aggregated_metrics returned an invalid shape",
    );
  }
  return { data: items.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Responses (per-model)
// ---------------------------------------------------------------------------

type LlmResponsesInput = {
  userPrompt: string;
  modelSlug: LlmResponseModelSlug;
  modelName: string;
  webSearch?: boolean;
  maxOutputTokens?: number;
  /** Two-letter ISO country code used to geolocate the web-search component. */
  webSearchCountryCode?: string;
};

type LlmResponseRequestFields = {
  user_prompt: string;
  model_name: string;
  web_search: boolean;
  force_web_search?: boolean;
  max_output_tokens: number;
  web_search_country_iso_code?: string;
};

export async function fetchLlmResponse(
  input: LlmResponsesInput,
): Promise<DataforseoApiResponse<LlmResponseResult>> {
  // Fail fast on an unknown model_name: DataForSEO charges for tasks that fail
  // with `Invalid Field: 'model_name'`, so we must never dispatch one. The
  // check runs against the live (cached, free) model catalog so newly released
  // models work without a code change.
  if (!(await isKnownLlmModelName(input.modelSlug, input.modelName))) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unsupported DataForSEO model_name "${input.modelName}" for ${input.modelSlug}`,
    );
  }

  // `web_search: true` is permission, not an instruction — models regularly
  // answer from parametric memory (observed ~40% search rate for gpt-5) and
  // then return no citations. Claude accepts `force_web_search` to make the
  // search actually happen; every ChatGPT model rejects it with 40501
  // "this model does not support 'force_web_search'" (verified 2026-08-25),
  // and Gemini/Perplexity don't document it, so only Claude gets the field.
  const webSearch = input.webSearch ?? LLM_RESPONSE_WEB_SEARCH_DEFAULT;
  if (
    webSearch &&
    input.webSearchCountryCode &&
    !supportsWebSearchCountry(input.modelSlug, input.webSearchCountryCode)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unsupported web-search country ${input.webSearchCountryCode} for ${input.modelSlug}`,
    );
  }
  // The country only geolocates the search: every model rejects it with 40501
  // "you must enable 'web_search'" when search is off (verified 2026-09-30).
  // DataForSEO's Gemini endpoint rejects it with a 40501 "Invalid Field" error.
  const fields: LlmResponseRequestFields = {
    user_prompt: input.userPrompt,
    model_name: input.modelName,
    web_search: webSearch,
    ...(webSearch && input.modelSlug === "claude"
      ? { force_web_search: true }
      : {}),
    max_output_tokens: clampLimit(input.maxOutputTokens ?? 1024, 256, 4096),
    ...(webSearch && input.webSearchCountryCode
      ? { web_search_country_iso_code: input.webSearchCountryCode }
      : {}),
  };

  const response = await dataforseoPost(
    `/v3/ai_optimization/${input.modelSlug}/llm_responses/live`,
    [fields],
    { classify: classifyAiSearchError },
  );

  const task = assertOk(
    response,
    assertOptions(`/v3/ai_optimization/${input.modelSlug}/llm_responses/live`),
  );

  const result = llmResponseResultSchema.safeParse(firstResult(task) ?? {});
  if (!result.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_responses returned an invalid response shape",
    );
  }
  return { data: result.data, billing: buildTaskBilling(task) };
}
