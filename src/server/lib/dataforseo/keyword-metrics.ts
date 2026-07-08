import type { createDataforseoClient } from "@/server/lib/dataforseo/client";
import type { AdsKeywordItem } from "@/server/lib/dataforseo/google-ads";
import type { KeywordOverviewItem } from "@/server/lib/dataforseo/labs";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import type { MonthlySearch } from "@/types/keywords";

type DataforseoClient = ReturnType<typeof createDataforseoClient>;

// Narrowed to the two endpoints the helper uses, so tests can fake it cheaply.
type KeywordMetricsClient = {
  labs: Pick<DataforseoClient["labs"], "keywordOverview">;
  keywords: Pick<DataforseoClient["keywords"], "adsSearchVolume">;
};

// DataForSEO's batch metric endpoints accept up to ~700 keywords per request.
const KEYWORD_METRICS_BATCH_SIZE = 700;

// `intent` is the raw `main_intent` (null for Google Ads); run it through
// `normalizeIntent` for the app enum. `competition` is a 0-1 ratio.
export type KeywordMetricRow = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
  keywordDifficulty: number | null;
  intent: string | null;
  monthlySearches: MonthlySearch[];
};

function toMonthlySearches(
  entries:
    | {
        year?: number | null;
        month?: number | null;
        search_volume?: number | null;
      }[]
    | null
    | undefined,
): MonthlySearch[] {
  return (entries ?? []).map((entry) => ({
    year: entry.year ?? 0,
    month: entry.month ?? 0,
    searchVolume: entry.search_volume ?? 0,
  }));
}

function normalizeKeywordOverview(
  item: KeywordOverviewItem,
  keyword: string,
): KeywordMetricRow {
  const info = item.keyword_info;
  // The clickstream-normalized block only exists when the caller opted into
  // clickstream data (it doubles request cost); prefer it when present.
  const clickstreamInfo = item.keyword_info_normalized_with_clickstream;
  const usesClickstream = clickstreamInfo?.search_volume != null;
  return {
    keyword,
    searchVolume: clickstreamInfo?.search_volume ?? info?.search_volume ?? null,
    cpc: info?.cpc ?? null,
    competition: info?.competition ?? null,
    competitionLevel: info?.competition_level ?? null,
    keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
    intent: item.search_intent_info?.main_intent ?? null,
    monthlySearches: toMonthlySearches(
      usesClickstream
        ? clickstreamInfo?.monthly_searches
        : info?.monthly_searches,
    ),
  };
}

// Google Ads items (countries Labs doesn't cover) carry volume/CPC/competition
// but no keyword difficulty or search intent.
function normalizeAdsKeyword(
  item: AdsKeywordItem,
  keyword: string,
): KeywordMetricRow {
  return {
    keyword,
    searchVolume: item.search_volume ?? null,
    cpc: item.cpc ?? null,
    // competition_index is a 0-100 scale; the app stores a 0-1 ratio.
    competition:
      item.competition_index != null ? item.competition_index / 100 : null,
    competitionLevel: item.competition ?? null,
    keywordDifficulty: null,
    intent: null,
    monthlySearches: toMonthlySearches(item.monthly_searches),
  };
}

// Hydrate a keyword list with fresh metrics: route by location (Labs vs Google
// Ads), batch under the per-call cap, and drop items DataForSEO returns without
// a keyword. `creditFeature` is required so spend is always attributed.
//
// `locationName` (canonical DataForSEO string, e.g. a city) scopes volume /
// CPC / competition to that location via Google Ads — the only source that
// accepts sub-country geotargets. Labs is country-only, so for Labs countries
// a local request runs both calls and merges: local volume from Google Ads,
// national KD / intent from Labs. National volume is never silently shown for
// a local request — keywords Google Ads doesn't return keep KD / intent but
// null volume / CPC.
export async function fetchKeywordMetricsForList(
  client: KeywordMetricsClient,
  params: {
    keywords: string[];
    locationCode: number;
    languageCode: string;
    creditFeature: CreditFeature;
    includeClickstreamData?: boolean;
    locationName?: string;
  },
): Promise<KeywordMetricRow[]> {
  const useGoogleAds =
    getKeywordDataProvider(params.locationCode) === "google_ads";
  const rows: KeywordMetricRow[] = [];

  for (let i = 0; i < params.keywords.length; i += KEYWORD_METRICS_BATCH_SIZE) {
    const keywords = params.keywords.slice(i, i + KEYWORD_METRICS_BATCH_SIZE);

    if (useGoogleAds) {
      const items = await client.keywords.adsSearchVolume({
        keywords,
        locationCode: params.locationCode,
        locationName: params.locationName,
        languageCode: params.languageCode,
        creditFeature: params.creditFeature,
      });
      const covered = new Set<string>();
      for (const item of items) {
        if (!item.keyword) continue;
        covered.add(item.keyword.toLowerCase());
        rows.push(normalizeAdsKeyword(item, item.keyword));
      }
      if (params.locationName) {
        // A local request must overwrite whatever scope the stored metrics
        // had — keywords Ads collapsed away get explicit nulls so stale
        // (possibly national) numbers can't survive under a local label.
        rows.push(
          ...keywords
            .filter((keyword) => !covered.has(keyword.toLowerCase()))
            .map(nullMetricRow),
        );
      }
    } else if (params.locationName) {
      const [adsItems, labsItems] = await Promise.all([
        client.keywords.adsSearchVolume({
          keywords,
          locationCode: params.locationCode,
          locationName: params.locationName,
          languageCode: params.languageCode,
          creditFeature: params.creditFeature,
        }),
        client.labs.keywordOverview({
          keywords,
          locationCode: params.locationCode,
          languageCode: params.languageCode,
          includeClickstreamData: params.includeClickstreamData ?? false,
          creditFeature: params.creditFeature,
        }),
      ]);
      rows.push(...mergeLocalAndNationalRows(keywords, adsItems, labsItems));
    } else {
      const items = await client.labs.keywordOverview({
        keywords,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        includeClickstreamData: params.includeClickstreamData ?? false,
        creditFeature: params.creditFeature,
      });
      for (const item of items) {
        if (!item.keyword) continue;
        rows.push(normalizeKeywordOverview(item, item.keyword));
      }
    }
  }

  return rows;
}

function nullMetricRow(keyword: string): KeywordMetricRow {
  return {
    keyword,
    searchVolume: null,
    cpc: null,
    competition: null,
    competitionLevel: null,
    keywordDifficulty: null,
    intent: null,
    monthlySearches: [],
  };
}

function mergeLocalAndNationalRows(
  keywords: string[],
  adsItems: AdsKeywordItem[],
  labsItems: KeywordOverviewItem[],
): KeywordMetricRow[] {
  const labsByKeyword = new Map(
    labsItems
      .filter((item) => item.keyword)
      .map((item) => [item.keyword!.toLowerCase(), item]),
  );
  const rows: KeywordMetricRow[] = [];
  const covered = new Set<string>();

  for (const item of adsItems) {
    if (!item.keyword) continue;
    covered.add(item.keyword.toLowerCase());
    const row = normalizeAdsKeyword(item, item.keyword);
    const labs = labsByKeyword.get(item.keyword.toLowerCase());
    row.keywordDifficulty =
      labs?.keyword_properties?.keyword_difficulty ?? null;
    row.intent = labs?.search_intent_info?.main_intent ?? null;
    rows.push(row);
  }

  // Google Ads occasionally collapses near-duplicate keywords into one item.
  // Keep the national KD / intent for the missing ones but leave volume / CPC
  // null rather than substituting the (misleading) national numbers.
  for (const keyword of keywords) {
    if (covered.has(keyword.toLowerCase())) continue;
    const labs = labsByKeyword.get(keyword.toLowerCase());
    if (!labs) continue;
    rows.push({
      ...nullMetricRow(keyword),
      keywordDifficulty: labs.keyword_properties?.keyword_difficulty ?? null,
      intent: labs.search_intent_info?.main_intent ?? null,
    });
  }

  return rows;
}
