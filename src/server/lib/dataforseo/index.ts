// Public surface of the DataForSEO integration. Internals live in the
// per-section files (labs / serp / business / backlinks / ai / lighthouse),
// which sit behind the single dynamic import in client.ts so the ~3 MB SDK
// loads lazily; everything funnels through envelope.ts (status + billing) and
// is metered in client.ts. Runtime values re-exported here must be SDK-free
// (shared.ts) or lazy — a static value re-export from a section file would
// drag the SDK back into the eager isolate startup graph.

import {
  loadDataforseoSections,
  type DataforseoSections,
} from "@/server/lib/dataforseo/client";

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

export { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";

/** Lazy wrapper for the one section fetcher called outside the metered client
 * (rank-check task collection is free at DataForSEO, so it skips metering). */
export const fetchRankCheckTaskResult: DataforseoSections["fetchRankCheckTaskResult"] =
  async (input) =>
    (await loadDataforseoSections()).fetchRankCheckTaskResult(input);

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
