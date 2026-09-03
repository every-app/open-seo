// Public surface of the DataForSEO integration. Internals live in the
// per-section files (labs / serp / business / backlinks / ai / lighthouse);
// everything funnels through envelope.ts (status + billing) and is metered in
// client.ts.

export { createDataforseoClient } from "@/server/lib/dataforseo/client";

export {
  fetchKeywordMetricsForList,
  type KeywordMetricRow,
} from "@/server/lib/dataforseo/keyword-metrics";

export {
  buildLlmTarget,
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
  MAX_TASKS_PER_POST,
  type LlmPlatform,
} from "@/server/lib/dataforseo/shared";

export { SERP_ANALYSIS_DEPTH } from "@/server/lib/dataforseo/serp";

export { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";

// Section fetchers called outside the metered client. Task collection is free
// at DataForSEO (the task was charged at task_post), so routing these through
// the metering seam would charge the customer twice; business categories are
// free ($0), so a zero-credit org can still list them.
export { fetchRankCheckTaskResult } from "@/server/lib/dataforseo/serp";
export {
  fetchBusinessDataTaskResult,
  fetchBusinessListingsCategories,
  type BusinessTaskEndpoint,
  type BusinessTaskOutcome,
} from "@/server/lib/dataforseo/business";

export type {
  LabsKeywordDataItem,
  DomainRankedKeywordItem,
  RelevantPagesItem,
} from "@/server/lib/dataforseo/labs";

export type { AdsKeywordIdeaItem } from "@/server/lib/dataforseo/google-ads";

export type {
  SerpLiveItem,
  RankCheckResult,
  RankCheckTaskInput,
  PostedRankCheckTask,
} from "@/server/lib/dataforseo/serp";

export type {
  BacklinksSummaryItem,
  BacklinksItem,
  ReferringDomainItem,
  DomainPageSummaryItem,
  BacklinksHistoryItem,
} from "@/server/lib/dataforseo/backlinks";
