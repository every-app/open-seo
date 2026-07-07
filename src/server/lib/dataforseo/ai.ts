import { z } from "zod";
import {
  AiOptimizationChatGptLlmResponsesLiveRequestInfo,
  AiOptimizationClaudeLlmResponsesLiveRequestInfo,
  AiOptimizationGeminiLlmResponsesLiveRequestInfo,
  AiOptimizationLLmMentionsCrossAggregateMetricsTargetInfo,
  AiOptimizationLLmMentionsDomainElement,
  AiOptimizationLLmMentionsKeywordElement,
  AiOptimizationLlmMentionsAggregatedMetricsLiveRequestInfo,
  AiOptimizationLlmMentionsCrossAggregatedMetricsLiveRequestInfo,
  AiOptimizationLlmMentionsSearchLiveRequestInfo,
  AiOptimizationLlmMentionsTopPagesLiveRequestInfo,
  type BaseAiOptimizationLLmMentionsTargetElement,
  type AiOptimizationPerplexityLlmResponsesLiveRequestInfo,
} from "dataforseo-client";
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
import { aiOptimizationApi } from "@/server/lib/dataforseo/core";
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

function targetList(
  target: LlmTarget,
): BaseAiOptimizationLLmMentionsTargetElement[] {
  return [
    "domain" in target
      ? new AiOptimizationLLmMentionsDomainElement(target)
      : new AiOptimizationLLmMentionsKeywordElement(target),
  ];
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
};

export async function fetchLlmMentionsSearch(
  input: LlmMentionsSearchInput,
): Promise<DataforseoApiResponse<LlmMentionItem[]>> {
  const response = await aiOptimizationApi(
    classifyAiSearchError,
  ).llmMentionsSearchLive([
    new AiOptimizationLlmMentionsSearchLiveRequestInfo({
      target: targetList(input.target),
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: clampLimit(input.limit ?? 100, 1, 1000),
    }),
  ]);
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
  const response = await aiOptimizationApi(
    classifyAiSearchError,
  ).llmMentionsAggregatedMetricsLive([
    new AiOptimizationLlmMentionsAggregatedMetricsLiveRequestInfo({
      target: targetList(input.target),
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      internal_list_limit: clampLimit(input.internalListLimit ?? 10, 1, 20),
    }),
  ]);
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
  const response = await aiOptimizationApi(
    classifyAiSearchError,
  ).llmMentionsTopPagesLive([
    new AiOptimizationLlmMentionsTopPagesLiveRequestInfo({
      target: targetList(input.target),
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      links_scope: "sources",
      items_list_limit: clampLimit(input.itemsListLimit ?? 10, 1, 10),
      internal_list_limit: 5,
    }),
  ]);
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

  const response = await aiOptimizationApi(
    classifyAiSearchError,
  ).llmMentionsCrossAggregatedMetricsLive([
    new AiOptimizationLlmMentionsCrossAggregatedMetricsLiveRequestInfo({
      targets: input.groups.map(
        (group) =>
          new AiOptimizationLLmMentionsCrossAggregateMetricsTargetInfo({
            aggregation_key: group.key,
            target: targetList(group.target),
          }),
      ),
      platform: input.platform,
      location_code: input.locationCode,
      language_code: input.languageCode,
      internal_list_limit: clampLimit(input.internalListLimit ?? 5, 1, 10),
    }),
  ]);
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

type LlmResponseModelSlug = "chat_gpt" | "claude" | "gemini" | "perplexity";

/**
 * Accepted `model_name` values per slug, mirroring DataForSEO's
 * `/ai_optimization/{model}/llm_responses/models` catalog (verified 2026-06-30).
 * We validate against this before dispatching because DataForSEO BILLS a task
 * that fails with `Invalid Field: 'model_name'` — a stale or mistyped model name
 * would otherwise pay for a guaranteed-rejected call. DataForSEO resolves a
 * basic alias (e.g. `claude-sonnet-4-5`) to its latest dated version.
 */
const ACCEPTED_LLM_MODEL_NAMES: Record<
  LlmResponseModelSlug,
  ReadonlySet<string>
> = {
  chat_gpt: new Set(["gpt-5"]),
  claude: new Set(["claude-sonnet-4-5", "claude-sonnet-4-6"]),
  gemini: new Set(["gemini-2.5-pro"]),
  perplexity: new Set(["sonar-reasoning-pro", "sonar-pro", "sonar"]),
};

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
  max_output_tokens: number;
  web_search_country_iso_code?: string;
};

function buildPerplexityLlmResponseRequest(
  fields: LlmResponseRequestFields,
): AiOptimizationPerplexityLlmResponsesLiveRequestInfo {
  return {
    ...fields,
    init(data?: unknown) {
      if (isRecord(data)) Object.assign(this, data);
    },
    toJSON(data?: unknown) {
      return {
        ...(isRecord(data) ? data : {}),
        ...fields,
      };
    },
  };
}

export async function fetchLlmResponse(
  input: LlmResponsesInput,
): Promise<DataforseoApiResponse<LlmResponseResult>> {
  // Fail fast on an unknown model_name: DataForSEO charges for tasks that fail
  // with `Invalid Field: 'model_name'`, so we must never dispatch one.
  if (!ACCEPTED_LLM_MODEL_NAMES[input.modelSlug].has(input.modelName)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unsupported DataForSEO model_name "${input.modelName}" for ${input.modelSlug}`,
    );
  }

  // DataForSEO's Gemini endpoint rejects `web_search_country_iso_code` with a
  // 40501 "Invalid Field" error. The other three models accept it.
  const supportsCountry = input.modelSlug !== "gemini";
  const fields: LlmResponseRequestFields = {
    user_prompt: input.userPrompt,
    model_name: input.modelName,
    web_search: input.webSearch ?? true,
    max_output_tokens: clampLimit(input.maxOutputTokens ?? 1024, 256, 4096),
    ...(supportsCountry && input.webSearchCountryCode
      ? { web_search_country_iso_code: input.webSearchCountryCode }
      : {}),
  };

  const api = aiOptimizationApi(classifyAiSearchError);
  const response =
    input.modelSlug === "chat_gpt"
      ? await api.chatGptLlmResponsesLive([
          new AiOptimizationChatGptLlmResponsesLiveRequestInfo(fields),
        ])
      : input.modelSlug === "claude"
        ? await api.claudeLlmResponsesLive([
            new AiOptimizationClaudeLlmResponsesLiveRequestInfo(fields),
          ])
        : input.modelSlug === "gemini"
          ? await api.geminiLlmResponsesLive([
              new AiOptimizationGeminiLlmResponsesLiveRequestInfo(fields),
            ])
          : await api.perplexityLlmResponsesLive([
              // The generated Perplexity request class drops `web_search` in
              // toJSON(), while the SDK method only JSON.stringify's this body.
              buildPerplexityLlmResponseRequest(fields),
            ]);

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
