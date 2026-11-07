import { waitUntil } from "cloudflare:workers";
import { sortBy } from "remeda";
import { runBatch } from "@/db/runBatch";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
import {
  checkUsageCreditsDepleted,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import { writeResearchKeywords } from "@/server/features/ai-visibility/repositories/aiVisibilityConfigurationRepository";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { bestPagePerQuery } from "@/server/features/gsc/searchPerformanceReport";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { normalizeKeyword } from "@/server/features/keywords/services/research/helpers";
import { researchWebsite } from "@/server/features/projects/services/websiteResearch";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { KeywordSuggestionReason } from "@/shared/keyword-suggestions";

const MAX_SUGGESTIONS = 10;
// A longer search returns results that drift off topic, so only short seed
// phrases are suggested. The long tail is in their results.
const MAX_SEED_WORDS = 3;
// Where the site's best page ranks, rounded: just below the top 3, then page 2.
// Lower on page 1 is too far from the top 3 to call close. Each band gets its
// own slots, since higher-ranked searches have far more impressions and would
// otherwise crowd out page 2.
const SEARCH_CONSOLE_BANDS = [
  { reason: KeywordSuggestionReason.CloseToTopThree, first: 4, last: 6 },
  { reason: KeywordSuggestionReason.CloseToPageOne, first: 11, last: 20 },
];
const MAX_PER_SEARCH_CONSOLE_BAND = 3;
// query x page fans out, so the bands need many rows to show up.
const QUERY_PAGE_ROW_LIMIT = 1000;

function isSeedPhrase(keyword: string) {
  return keyword.trim().split(/\s+/).length <= MAX_SEED_WORDS;
}

/** Short searches the site ranks for just below the top 3 or on page 2, or
 *  null without a working Search Console connection. */
async function listSearchConsoleSuggestions(projectId: string) {
  try {
    const { rows } = await GscService.getPerformance({
      projectId,
      ...resolveDateRange({ dateRange: "last_28_days" }),
      type: "web",
      dimensions: ["query", "page"],
      rowLimit: QUERY_PAGE_ROW_LIMIT,
    });
    const searches = sortBy(
      bestPagePerQuery(rows).filter((row) => isSeedPhrase(row.query)),
      [(row) => row.impressions, "desc"],
    );
    return SEARCH_CONSOLE_BANDS.flatMap(({ reason, first, last }) =>
      searches
        .filter((row) => {
          const rank = Math.round(row.position);
          return rank >= first && rank <= last;
        })
        .slice(0, MAX_PER_SEARCH_CONSOLE_BAND)
        .map((row) => ({ keyword: row.query, reason })),
    );
  } catch (error) {
    if (error instanceof GscNotConnectedError || isExpectedGrantFailure(error))
      return null;
    throw error;
  }
}

async function getSuggestions(project: Pick<EnsuredProject, "id" | "domain">) {
  const [searchConsoleSuggestions, topics] = await Promise.all([
    listSearchConsoleSuggestions(project.id),
    AiVisibilityRepository.listResearchKeywords(project.id),
  ]);
  const suggested = new Set<string>();
  const suggestions = [
    ...(searchConsoleSuggestions ?? []),
    ...topics.filter(isSeedPhrase).map((keyword) => ({
      keyword,
      reason: KeywordSuggestionReason.FromYourSite,
    })),
  ]
    // Written the way research normalizes a search, so they read like the
    // keywords in Recent searches and the results.
    .map((suggestion) => ({
      ...suggestion,
      keyword: normalizeKeyword(suggestion.keyword),
    }))
    .filter(({ keyword }) => {
      if (suggested.has(keyword)) return false;
      suggested.add(keyword);
      return true;
    });
  return {
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    // Topics come from the website, so a project needs one to generate them.
    canGenerate: Boolean(project.domain) && topics.length === 0,
    searchConsoleConnected: searchConsoleSuggestions !== null,
  };
}

/**
 * Saves topics for a project that has none, from the same website research
 * AI visibility setup runs, without competitors. They go in the same Prompt
 * Research keywords, so setup later reuses them. Nothing here touches AI
 * visibility setup or creates a tracker, so nothing recurring is billed.
 */
async function generate(
  project: EnsuredProject,
  customer: BillingCustomerContext,
) {
  if (!project.domain)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add your website in project settings to get suggestions.",
    );
  // Setup in another tab may have saved topics since the page loaded.
  if ((await AiVisibilityRepository.listResearchKeywords(project.id)).length)
    return;
  // Any positive balance admits the run; it bills its actual spend at the end.
  if (
    (await isHostedServerAuthMode()) &&
    (await checkUsageCreditsDepleted(customer)).depleted
  )
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "You need usage credits to generate suggestions.",
    );
  const work = researchWebsite(
    project.domain,
    project,
    { ...customer, projectId: project.id },
    { skipCompetitors: true },
  ).then((research) =>
    runBatch((tx) =>
      writeResearchKeywords(tx, project.id, [
        ...research.suggestedTopics.map((topic) => topic.name),
        ...research.suggestedKeywords,
      ]),
    ),
  );
  // Keep the paid run, its billing and the save alive if the tab closes.
  waitUntil(work.catch(() => undefined));
  await work;
}

export const KeywordSuggestionService = { getSuggestions, generate };
