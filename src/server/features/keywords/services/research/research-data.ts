import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import type { KeywordIdeaItem } from "@/server/lib/keyword-providers/types";
import { fetchGoogleAdsKeywordIdeas, hasGoogleAdsCredentials } from "@/server/lib/keyword-providers/google-ads";
import { fetchBingKeywordIdeasAsItems, hasBingCredentials } from "@/server/lib/keyword-providers/bing";
import {
  normalizeIntent,
  normalizeKeyword,
  type EnrichedKeyword,
} from "./helpers";
import type { KeywordSource } from "./selection";

export type FetchResearchRowsParams = {
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: number;
  source: KeywordSource;
  includeClickstreamData?: boolean;
  // Retired with the DataForSEO path; accepted so call sites stay stable.
  creditFeature?: CreditFeature;
};

/**
 * Map provider-neutral idea rows (Google Ads Keyword Planner or Bing
 * Webmaster) into the enriched research shape. Neither provider exposes
 * keyword difficulty or search intent, so both stay null/unknown — the UI
 * already tolerates that from the retired Google-Ads-only path.
 */
export function mapProviderItems(items: KeywordIdeaItem[]): EnrichedKeyword[] {
  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item.keyword) continue;
    const normalized = normalizeKeyword(item.keyword);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    rows.push({
      keyword: normalized,
      searchVolume: item.searchVolume ?? null,
      trend: (item.monthlySearches ?? []).map((entry) => ({
        year: entry.year ?? 0,
        month: entry.month ?? 0,
        searchVolume: entry.searchVolume ?? 0,
      })),
      cpc: item.cpc ?? null,
      competition: item.competition ?? null,
      keywordDifficulty: null,
      intent: normalizeIntent(null),
    });
  }

  return rows;
}

export async function fetchResearchRowsBySource(
  params: FetchResearchRowsParams,
): Promise<EnrichedKeyword[]> {
  // Both providers return idea-style rows for a seed keyword; the requested
  // source (related / suggestions / ideas) collapses into one query per
  // provider. Clickstream refinement died with DataForSEO.
  void params.source;
  void params.includeClickstreamData;

  // Degraded mode: with no provider configured (or when every configured
  // provider fails), return empty rows instead of throwing so the rest of
  // the app (caching, selection, UI) stays exercisable for testing.
  if (await hasGoogleAdsCredentials()) {
    try {
      return mapProviderItems(
        await fetchGoogleAdsKeywordIdeas({
          keyword: params.seedKeyword,
          locationCode: params.locationCode,
          languageCode: params.languageCode,
          limit: params.resultLimit,
        }),
      );
    } catch {
      // Fall through to Bing.
    }
  }

  if (await hasBingCredentials()) {
    try {
      return mapProviderItems(
        await fetchBingKeywordIdeasAsItems({
          keyword: params.seedKeyword,
          languageCode: params.languageCode,
          locationCode: params.locationCode,
          limit: params.resultLimit,
        }),
      );
    } catch {
      // Both providers unavailable.
    }
  }

  return [];
}
