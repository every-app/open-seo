import {
  fetchBusinessListingsSearch,
  fetchMyBusinessInfo,
  fetchQuestionsAnswers,
  postGoogleReviewsTask,
  postMyBusinessUpdatesTask,
} from "@/server/lib/dataforseo/business";
import {
  BACKLINKS_DEFAULT_LIMIT,
  fetchBacklinksHistory,
  fetchBacklinksRows,
  fetchBacklinksSummary,
  fetchDomainPagesSummary,
  fetchReferringDomains,
} from "@/server/lib/dataforseo/backlinks";
import {
  fetchDomainRankOverview,
  fetchKeywordIdeas,
  fetchKeywordOverview,
  fetchKeywordSuggestions,
  fetchRankedKeywords,
  fetchRelatedKeywords,
  fetchRelevantPages,
  fetchSerpCompetitors,
} from "@/server/lib/dataforseo/labs";
import {
  fetchAdsKeywordIdeas,
  fetchAdsSearchVolume,
} from "@/server/lib/dataforseo/google-ads";
import {
  clampSerpDepth,
  fetchLiveSerp,
  fetchLocalSerp,
  fetchRankCheckSerp,
  postLocalSerpTasks,
  postRankCheckTasks,
  SERP_ANALYSIS_DEPTH,
} from "@/server/lib/dataforseo/serp";
import { fetchLighthouseResult } from "@/server/lib/dataforseo/lighthouse";
import {
  fetchLlmAggregatedMetrics,
  fetchLlmCrossAggregatedMetrics,
  fetchLlmMentionsSearch,
  fetchLlmResponse,
  fetchLlmTopPages,
  LLM_RESPONSE_WEB_SEARCH_DEFAULT,
  resolveLlmMentionsLimit,
} from "@/server/lib/dataforseo/ai";
import type { LlmResponseModelSlug } from "@/server/lib/dataforseo/llm-models";
import {
  fetchAiTrackingLiveAnswer,
  postAiTrackingTasks,
} from "@/server/lib/dataforseo/ai-tracking";
import {
  AI_LIVE_RECORD_COST_USD,
  AI_RECORD_COST_USD,
} from "@/shared/ai-visibility";
import {
  costPerSerpAtDepth,
  serpKeywordCostMultiplier,
} from "@/shared/rank-tracking";

/**
 * Raw DataForSEO USD upper bound for one metered call, computed from the
 * fetcher's input before the call is made. The metering seam reserves
 * `creditsForProviderUsd(estimate)` and settles on the provider's real
 * `cost`, so every number here must be >= what DataForSEO actually charges
 * for that input. Overestimating only refuses a call slightly early at the
 * tail of a balance; underestimating lets spend past the balance.
 *
 * Prices are raw (pre-markup) USD from DataForSEO's per-account price table
 * (the `price` object on the free GET /v3/appendix/user_data), read Sep 2026.
 * That table has only each endpoint's base price, so per-page, per-depth and
 * token-priced shapes are "measured": set from real billed costs, which the
 * free POST /v3/<api>/id_list returns per task alongside the request
 * parameters for the last month. Re-check a price against id_list, not a
 * one-off fixture.
 */

// DataForSEO Labs (dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api):
// per task + per returned row, doubled with include_clickstream_data. The
// spec 0004 figures ($0.01 + $0.0001) predate a price rise; web/pricing.tsx
// ("150-300 rows = $0.030-$0.048 raw", Jul 2026) matches these.
const LABS_TASK_USD = 0.012;
const LABS_ROW_USD = 0.00012;

// Keywords Data Google Ads, live mode (dataforseo.com/pricing/keywords-data/google-ads).
const GOOGLE_ADS_LIVE_TASK_USD = 0.09;

// Backlinks API, uniform across endpoints (dataforseo.com/pricing/backlinks/backlinks).
const BACKLINKS_TASK_USD = 0.024;
const BACKLINKS_ROW_USD = 0.000036;

// Business Data (dataforseo.com/pricing/business-data/*). Task-queue posts
// run at priority 2 (business.ts TASK_PRIORITY_HIGH), which doubles the
// standard-queue rates quoted on the pricing pages.
const BUSINESS_LISTINGS_TASK_USD = 0.012;
const BUSINESS_LISTINGS_ROW_USD = 0.00036;
const MY_BUSINESS_INFO_LIVE_USD = 0.0054;
// measured: billed per 20 rows of depth ($0.0054 at depth 10 and 20, $0.0108
// at 30, $0.027 at 100).
const QUESTIONS_ANSWERS_PER_20_USD = 0.0054;
// uncalibrated: the list prices undershoot the fixtures, which bill $0.00375
// (regular) and $0.01 (extended_reviews) for one depth-20 priority post.
const REVIEWS_PRIORITY_TASK_USD = 0.001;
const REVIEWS_PRIORITY_PER_10_USD = 0.0015;
const EXTENDED_REVIEWS_PRIORITY_PER_20_USD = 0.01;
const UPDATES_PRIORITY_TASK_USD = 0.003;
const UPDATES_PRIORITY_PER_10_USD = 0.0015;

// OnPage Lighthouse, live (dataforseo.com/pricing/on-page/lighthouse-api);
// fixtures show $0.00425 billed.
const LIGHTHOUSE_LIVE_USD = 0.005;

// AI Optimization (dataforseo.com/pricing/ai-optimization/llm-mentions):
// $0.1 per request + $0.001 per row on every llm_mentions endpoint.
const LLM_MENTIONS_TASK_USD = 0.1;
const LLM_MENTIONS_ROW_USD = 0.001;
// measured: the aggregate endpoints and top_pages return one result row, and
// every observed call billed $0.101.
const LLM_MENTIONS_ONE_ROW_USD = LLM_MENTIONS_TASK_USD + LLM_MENTIONS_ROW_USD;
// measured, token-priced: $0.0006 + the model's own bill. Measured with a
// long-answer prompt at the 4096-token output cap on the model Prompt Explorer
// sends per slug, then padded ~1.25x without web search and ~1.3x with it,
// where the searched pages add a variable input bill. Measured bills: gpt-5
// $0.072 / $0.042, claude-sonnet-4-5 $0.142 / $0.062, gemini-2.5-pro
// $0.085 / $0.042, sonar-reasoning-pro $0.028 (it always searches).
const LLM_RESPONSE_USD: Record<
  LlmResponseModelSlug,
  { webSearch: number; noSearch: number }
> = {
  chat_gpt: { webSearch: 0.09, noSearch: 0.05 },
  claude: { webSearch: 0.18, noSearch: 0.08 },
  gemini: { webSearch: 0.11, noSearch: 0.05 },
  perplexity: { webSearch: 0.04, noSearch: 0.04 },
};

/** Estimated USD for one live LLM response at the 4096-token output cap. */
export function llmResponseUsd(
  modelSlug: LlmResponseModelSlug,
  webSearch: boolean,
): number {
  const price = LLM_RESPONSE_USD[modelSlug];
  return webSearch ? price.webSearch : price.noSearch;
}

// SERP Google Maps and Local Finder, live. measured: Maps bills one request
// through depth 100 ($0.002 at depth 20 and 100), and no caller asks for
// more. Local Finder bills every page of 10 at the first-page rate ($0.02 at
// depth 100).
const LOCAL_SERP_PAGE_USD = 0.002;
// SERP Google Maps, queued at high priority. measured: task_post bills $0.0012
// per task at depth 20.
const LOCAL_SERP_TASK_USD = 0.0012;

type ProviderUsdEstimator<I> = (input: I) => number;

/** Ties an estimator to a fetcher so it is typed against that fetcher's input. */
function priced<I>(
  _fetcher: (input: I) => unknown,
  estimate: ProviderUsdEstimator<I>,
): ProviderUsdEstimator<I> {
  return estimate;
}

function labsUsd(rows: number, clickstream?: boolean) {
  return (LABS_TASK_USD + rows * LABS_ROW_USD) * (clickstream ? 2 : 1);
}

function backlinksUsd(rows: number) {
  return BACKLINKS_TASK_USD + rows * BACKLINKS_ROW_USD;
}

/** SERP endpoints bill per page of 10; a partial page is a full page. */
function serpUsd(depth: number, method: "live" | "queued", keyword: string) {
  return (
    costPerSerpAtDepth(Math.ceil(depth / 10) * 10, method) *
    serpKeywordCostMultiplier(keyword)
  );
}

function daysInclusive(from: string, to: string) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/** One raw-USD upper-bound estimator per entry in createDataforseoClient. */
export const dataforseoPricing = {
  business: {
    businessListings: priced(
      fetchBusinessListingsSearch,
      (input) =>
        BUSINESS_LISTINGS_TASK_USD + input.limit * BUSINESS_LISTINGS_ROW_USD,
    ),
    questionsAnswers: priced(
      fetchQuestionsAnswers,
      (input) => Math.ceil(input.depth / 20) * QUESTIONS_ANSWERS_PER_20_USD,
    ),
    myBusinessInfo: priced(
      fetchMyBusinessInfo,
      () => MY_BUSINESS_INFO_LIVE_USD,
    ),
    reviewsTaskPost: priced(postGoogleReviewsTask, (input) =>
      input.includeOtherSources
        ? Math.ceil(input.depth / 20) * EXTENDED_REVIEWS_PRIORITY_PER_20_USD
        : REVIEWS_PRIORITY_TASK_USD +
          Math.ceil(input.depth / 10) * REVIEWS_PRIORITY_PER_10_USD,
    ),
    updatesTaskPost: priced(
      postMyBusinessUpdatesTask,
      (input) =>
        UPDATES_PRIORITY_TASK_USD +
        Math.ceil(input.depth / 10) * UPDATES_PRIORITY_PER_10_USD,
    ),
  },
  backlinks: {
    summary: priced(fetchBacklinksSummary, () => backlinksUsd(1)),
    rows: priced(fetchBacklinksRows, (input) =>
      backlinksUsd(input.limit ?? BACKLINKS_DEFAULT_LIMIT),
    ),
    referringDomains: priced(fetchReferringDomains, (input) =>
      backlinksUsd(input.limit ?? BACKLINKS_DEFAULT_LIMIT),
    ),
    domainPages: priced(fetchDomainPagesSummary, (input) =>
      backlinksUsd(input.limit ?? BACKLINKS_DEFAULT_LIMIT),
    ),
    history: priced(fetchBacklinksHistory, (input) =>
      backlinksUsd(daysInclusive(input.dateFrom, input.dateTo)),
    ),
  },
  keywords: {
    related: priced(fetchRelatedKeywords, (input) =>
      labsUsd(input.limit, input.includeClickstreamData),
    ),
    suggestions: priced(fetchKeywordSuggestions, (input) =>
      labsUsd(input.limit, input.includeClickstreamData),
    ),
    ideas: priced(fetchKeywordIdeas, (input) =>
      labsUsd(input.limit, input.includeClickstreamData),
    ),
    adsIdeas: priced(fetchAdsKeywordIdeas, () => GOOGLE_ADS_LIVE_TASK_USD),
    adsSearchVolume: priced(
      fetchAdsSearchVolume,
      () => GOOGLE_ADS_LIVE_TASK_USD,
    ),
  },
  domain: {
    rankOverview: priced(fetchDomainRankOverview, () => labsUsd(1)),
    rankedKeywords: priced(fetchRankedKeywords, (input) =>
      labsUsd(input.limit),
    ),
    relevantPages: priced(fetchRelevantPages, (input) => labsUsd(input.limit)),
  },
  serp: {
    live: priced(fetchLiveSerp, (input) =>
      serpUsd(
        clampSerpDepth(input.depth ?? SERP_ANALYSIS_DEPTH),
        "live",
        input.keyword,
      ),
    ),
    rankCheck: priced(fetchRankCheckSerp, (input) =>
      serpUsd(clampSerpDepth(input.depth), "live", input.keyword),
    ),
    rankCheckTaskPost: priced(postRankCheckTasks, (input) =>
      input.tasks.reduce(
        (sum, task) =>
          sum + serpUsd(clampSerpDepth(input.depth), "queued", task.keyword),
        0,
      ),
    ),
    local: priced(fetchLocalSerp, (input) =>
      input.searchType === "maps"
        ? LOCAL_SERP_PAGE_USD
        : Math.ceil(input.depth / 10) * LOCAL_SERP_PAGE_USD,
    ),
    localTaskPost: priced(
      postLocalSerpTasks,
      (input) => input.locationCoordinates.length * LOCAL_SERP_TASK_USD,
    ),
  },
  labs: {
    keywordOverview: priced(fetchKeywordOverview, (input) =>
      labsUsd(input.keywords.length, input.includeClickstreamData),
    ),
    serpCompetitors: priced(fetchSerpCompetitors, (input) =>
      labsUsd(input.limit),
    ),
  },
  lighthouse: {
    live: priced(fetchLighthouseResult, () => LIGHTHOUSE_LIVE_USD),
  },
  aiSearch: {
    mentionsSearch: priced(
      fetchLlmMentionsSearch,
      (input) =>
        LLM_MENTIONS_TASK_USD +
        resolveLlmMentionsLimit(input.limit) * LLM_MENTIONS_ROW_USD,
    ),
    aggregatedMetrics: priced(
      fetchLlmAggregatedMetrics,
      () => LLM_MENTIONS_ONE_ROW_USD,
    ),
    topPages: priced(fetchLlmTopPages, () => LLM_MENTIONS_ONE_ROW_USD),
    crossAggregatedMetrics: priced(
      fetchLlmCrossAggregatedMetrics,
      () => LLM_MENTIONS_ONE_ROW_USD,
    ),
    // One standard-queue answer per task, on every tracked engine.
    trackingTaskPost: priced(
      postAiTrackingTasks,
      (input) => input.tasks.length * AI_RECORD_COST_USD,
    ),
    // One live answer, on every tracked engine.
    trackingLive: priced(
      fetchAiTrackingLiveAnswer,
      () => AI_LIVE_RECORD_COST_USD,
    ),
    llmResponse: priced(fetchLlmResponse, (input) =>
      llmResponseUsd(
        input.modelSlug,
        input.webSearch ?? LLM_RESPONSE_WEB_SEARCH_DEFAULT,
      ),
    ),
  },
} as const;
