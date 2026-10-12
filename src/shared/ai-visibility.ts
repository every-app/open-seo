import {
  getIsoCountryCode,
  LOCATION_OPTIONS,
  SERP_LANGUAGE_OPTIONS,
} from "@/shared/keyword-locations";
import { supportsWebSearchCountry } from "@/shared/prompt-search-countries";

export type AiEngine =
  | "chatgpt"
  | "gemini"
  | "google_ai_overview"
  | "claude"
  | "perplexity";
export const AI_ENGINE_LABELS: Record<AiEngine, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  google_ai_overview: "Google AI Overviews",
  claude: "Claude",
  perplexity: "Perplexity",
};
/**
 * Engines DataForSEO has no LLM Scraper for. Their answers come from the live
 * LLM Responses API, at live API pricing. Each name is also its API model slug.
 */
export type AiModelApiEngine = Extract<AiEngine, "claude" | "perplexity">;
export function aiEngineUsesModelApi(
  engine: AiEngine,
): engine is AiModelApiEngine {
  return engine === "claude" || engine === "perplexity";
}
/**
 * Raw DataForSEO USD for one answer, standard queue. AI Overviews is one
 * organic SERP page ($0.0006) plus the async overview load ($0.0006).
 */
export const AI_RECORD_COST_USD = 0.0012;
/**
 * Raw DataForSEO USD for one live answer, used by manual runs. AI Overviews is
 * one live organic SERP page ($0.002) plus the async overview load ($0.002).
 */
export const AI_LIVE_RECORD_COST_USD = 0.004;
export type AiScheduleInterval = "daily" | "weekly" | "monthly";
export type AiObservationStatus = "pending" | "completed" | "failed";
/** Prompts without a chosen topic are grouped here. */
export const AI_DEFAULT_TOPIC = "General";
export interface AiPrompt {
  id: string;
  text: string;
  topic: string;
  paused: boolean;
  archived: boolean;
  branded: boolean;
  /** Whether any run has collected answer text for this prompt. */
  hasResults: boolean;
}
export interface AiBrand {
  name: string;
  domain: string;
  own: boolean;
}
export interface AiTracker {
  id: string;
  projectId: string;
  enabled: boolean;
  locationCode: number;
  languageCode: string;
  scheduleInterval: AiScheduleInterval;
  nextCheckAt: string | null;
  lastSkipReason: string | null;
  createdAt: string;
}
export interface AiCapability {
  engine: AiEngine;
  label: string;
  /** Countries from the shared market list this engine cannot collect in. */
  unsupportedLocationCodes: number[];
  maxPromptLength: number;
  note: string;
  /** Every run asks the model's API, at live API pricing. */
  modelApi: boolean;
}
export interface AiRun {
  id: string;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  trigger: "baseline" | "scheduled" | "manual";
  expected: number;
  completed: number;
  failed: number;
  pending: number;
  createdAt: string;
  completedAt: string | null;
  pollAfterSeconds: number;
}
export interface AiTrackerState {
  configured: boolean;
  tracker: AiTracker | null;
  /** Topics of unarchived prompts, in name order. */
  topics: string[];
  prompts: AiPrompt[];
  brands: AiBrand[];
  engines: AiEngine[];
  capabilities: AiCapability[];
  recentRuns: AiRun[];
  providerConfigured: boolean;
}
export interface AiResearchedPrompt {
  text: string;
  /** Near-duplicate prompts merged into this one. */
  variants: string[];
  sources: {
    domain: string;
    url: string;
    title: string | null;
    own: boolean;
  }[];
  ownDomainCited: boolean;
  brandMentioned: boolean;
  tracked: boolean;
}
export interface AiPromptResearchResult {
  keyword: string;
  /** Most common questions first. */
  prompts: AiResearchedPrompt[];
}
export interface AiCostEstimate {
  promptCount: number;
  engineCount: number;
  observations: number;
  providerCostUsd: number;
  costUsd: number;
  costCredits: number;
  /** A one-off Run now check collects live answers, at the live price. */
  runNowCostUsd: number;
  runNowCostCredits: number;
  scheduleInterval: AiScheduleInterval;
  checksPerMonth: number;
  monthlyCostUsd: number;
  currency: "USD";
  warnings: string[];
}
export interface AiBrandResult {
  name: string;
  domain: string;
  own: boolean;
  mentioned: boolean;
  cited: boolean;
  /** Character offset of the first mention in the answer, or null. */
  firstMention: number | null;
}
export interface AiObservationRow {
  id: string;
  runId: string;
  promptId: string;
  prompt: string;
  topic: string;
  branded: boolean;
  engine: AiEngine;
  status: AiObservationStatus;
  answerStatus: "answered" | "no_answer" | null;
  brands: AiBrandResult[];
  citationCount: number;
  collectedAt: string | null;
  error: string | null;
}
export interface AiBrandSummary {
  name: string;
  domain: string;
  own: boolean;
  /** Answered collections in scope; the denominator for both rates. */
  answers: number;
  mentions: number;
  citations: number;
  /** Sum and count of mention positions (1 = named first) in answers naming it. */
  positionTotal: number;
  positionCount: number;
}
export interface AiResults {
  runId: string | null;
  run: AiRun | null;
  rows: AiObservationRow[];
  totalCount: number;
  nextCursor: string | null;
  summaries: AiBrandSummary[];
  coverage: {
    expected: number;
    completed: number;
    noAnswer: number;
    failed: number;
    pending: number;
  };
  appliedFilters: {
    topic?: string;
    engines?: AiEngine[];
    competitorGap: boolean;
    branded: string;
  };
  truncated: boolean;
}
export interface AiSource {
  url: string;
  domain: string;
  title: string | null;
  position: number;
}
export interface AiAnswer {
  observation: AiObservationRow;
  answerText: string | null;
  answerMarkdown: string | null;
  /** Cited pages, in the engine's order. */
  sources: AiSource[];
  /** Where each mentioned brand appears in answerText. */
  mentions: { domain: string; spans: { start: number; end: number }[] }[];
  requestedLocationCode: number;
  requestedLanguageCode: string;
  truncated: boolean;
}
export interface AiSourceRow {
  key: string;
  url: string | null;
  domain: string;
  title: string | null;
  ownership: "own" | "competitor" | "other";
  answerCount: number;
  promptCount: number;
  /** The tracked prompts whose answers cited this source. */
  promptIds: string[];
  engines: { engine: AiEngine; answerCount: number }[];
  observationIds: string[];
  truncated: boolean;
}
export interface AiSources {
  runId: string | null;
  rows: AiSourceRow[];
  totalCount: number;
  nextCursor: string | null;
  coverage: AiResults["coverage"];
  appliedFilters: AiResults["appliedFilters"] & {
    ownership: "all" | "own" | "competitor" | "other";
  };
  groupBy: "url" | "domain";
  truncated: boolean;
}

export interface AiTrendCoverage {
  runs: number;
  expected: number;
  answered: number;
  noAnswer: number;
  failed: number;
}
export interface AiTrendPeriod {
  start: string;
  end: string;
  coverage: AiTrendCoverage;
}
/**
 * One metric over prompt/engine/market/brand-identity cells. Each rate is the mean of the
 * cells' own rates, so every cell counts equally in both periods.
 */
export interface AiTrendMetric {
  /** Mean over matched cells, or over every current cell without a comparison. */
  current: number | null;
  previous: number | null;
  /** Percentage points, only when the comparison is fair. */
  change: number | null;
  matchedCells: number;
  currentCells: number;
  previousCells: number;
}
export type AiTrendComparison =
  | "comparable"
  | "incomplete"
  | "scope_changed"
  | "no_previous"
  | "no_data";
export interface AiTrend {
  days: number;
  comparison: AiTrendComparison;
  current: AiTrendPeriod;
  previous: AiTrendPeriod;
  mentions: AiTrendMetric;
  citations: AiTrendMetric;
  engines: {
    engine: AiEngine;
    mentions: AiTrendMetric;
    citations: AiTrendMetric;
  }[];
  /** One point per finished baseline or scheduled run, oldest first. */
  runs: {
    runId: string;
    createdAt: string;
    mentionRate: number | null;
    citationRate: number | null;
    coverage: AiTrendCoverage;
  }[];
}

/**
 * Countries from the shared market list that DataForSEO cannot collect for an
 * engine. Keep in sync with each engine's DataForSEO locations endpoint.
 */
export const AI_UNSUPPORTED_LOCATIONS: Record<AiEngine, readonly number[]> = {
  chatgpt: [2275],
  gemini: [],
  google_ai_overview: [],
  claude: liveUnsupportedLocations("claude"),
  perplexity: liveUnsupportedLocations("perplexity"),
};

/** Countries a live engine's web search does not accept. */
function liveUnsupportedLocations(engine: AiModelApiEngine): number[] {
  return LOCATION_OPTIONS.filter(
    (option) =>
      !supportsWebSearchCountry(
        engine,
        getIsoCountryCode(option.code).toUpperCase(),
      ),
  ).map((option) => option.code);
}

/** "In progress" while a collection is unfinished. */
export function aiObservationStatusLabel(status: AiObservationStatus): string {
  return status === "pending" ? "In progress" : status;
}

/** An empty AI Overviews result means Google showed no overview. */
export function aiNoAnswerLabel(engine: AiEngine): string {
  return engine === "google_ai_overview"
    ? "No AI Overview shown"
    : "No substantive answer";
}

/** The selected engines that cannot collect in this country. */
export function aiEnginesWithoutLocation(
  engines: readonly AiEngine[],
  locationCode: number,
): AiEngine[] {
  return engines.filter((engine) =>
    AI_UNSUPPORTED_LOCATIONS[engine].includes(locationCode),
  );
}

export function aiCountryLabel(locationCode: number): string {
  return (
    LOCATION_OPTIONS.find((option) => option.code === locationCode)?.label ??
    `Location ${locationCode}`
  );
}

/** "Bulgaria · Bulgarian" */
export function aiMarketLabel(market: {
  locationCode: number;
  languageCode: string;
}): string {
  const language =
    SERP_LANGUAGE_OPTIONS.find((option) => option.code === market.languageCode)
      ?.label ?? market.languageCode;
  return `${aiCountryLabel(market.locationCode)} · ${language}`;
}
