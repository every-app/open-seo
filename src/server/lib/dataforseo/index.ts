// Public surface of the DataForSEO integration. Internals live in the
// per-section files (labs / serp / business / backlinks / ai /
// lighthouse); everything funnels through envelope.ts (status + billing) and is
// metered in client.ts.

export { createDataforseoClient } from "@/server/lib/dataforseo/client";

export {
  type LabsKeywordDataItem,
  type DomainRankedKeywordItem,
  type RelevantPagesItem,
  type KeywordOverviewItem,
} from "@/server/lib/dataforseo/labs";

export {
  type AdsKeywordItem,
  type AdsKeywordIdeaItem,
} from "@/server/lib/dataforseo/google-ads";

export {
  fetchRankCheckTaskResult,
  MAX_TASKS_PER_POST,
  type SerpLiveItem,
  type RankCheckResult,
  type RankCheckTaskInput,
  type PostedRankCheckTask,
} from "@/server/lib/dataforseo/serp";

export {
  normalizeBacklinksTarget,
  type BacklinksSummaryItem,
  type BacklinksItem,
  type ReferringDomainItem,
  type DomainPageSummaryItem,
  type BacklinksHistoryItem,
} from "@/server/lib/dataforseo/backlinks";

export {
  buildLlmTarget,
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
  type LlmPlatform,
} from "@/server/lib/dataforseo/ai";
