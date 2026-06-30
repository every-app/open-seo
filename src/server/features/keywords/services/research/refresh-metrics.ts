import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { normalizeIntent } from "@/server/features/keywords/services/research/helpers";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { KeywordIntent, MonthlySearch } from "@/types/keywords";
import type { RefreshSavedKeywordMetricsInput } from "@/types/schemas/keywords";
import { getKeywordDataProvider } from "@/shared/keyword-locations";

const REFRESH_BATCH_SIZE = 700;

// Match the shape the research/save flow persists so a refresh never degrades
// stored metrics (see research-data.ts mapKeywordDataItems / mapAdsKeywordItems).
function toMonthlySearchesJson(
  entries:
    | {
        year?: number | null;
        month?: number | null;
        search_volume?: number | null;
      }[]
    | null
    | undefined,
): string {
  const trend: MonthlySearch[] = (entries ?? []).map((entry) => ({
    year: entry.year ?? 0,
    month: entry.month ?? 0,
    searchVolume: entry.search_volume ?? 0,
  }));
  return JSON.stringify(trend);
}

type RefreshedMetric = {
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: KeywordIntent;
  monthlySearchesJson: string;
};

// Fetch fresh metrics for one homogeneous batch and key them by lowercase
// keyword. Labs covers most countries; the rest fall back to Google Ads, which
// carries volume/CPC/competition but no difficulty or intent.
async function fetchBatchMetrics(
  client: ReturnType<typeof createDataforseoClient>,
  request: { keywords: string[]; locationCode: number; languageCode: string },
  useGoogleAds: boolean,
): Promise<Map<string, RefreshedMetric>> {
  const metricsMap = new Map<string, RefreshedMetric>();

  if (useGoogleAds) {
    const items = await client.keywords.adsSearchVolume({
      ...request,
      creditFeature: "keyword_research",
    });
    for (const item of items) {
      if (!item.keyword) continue;
      metricsMap.set(item.keyword.toLowerCase(), {
        searchVolume: item.search_volume ?? null,
        cpc: item.cpc ?? null,
        // competition_index is 0-100; the rest of the app stores a 0-1 ratio.
        competition:
          item.competition_index != null ? item.competition_index / 100 : null,
        keywordDifficulty: null,
        intent: "unknown",
        monthlySearchesJson: toMonthlySearchesJson(item.monthly_searches),
      });
    }
    return metricsMap;
  }

  const items = await client.labs.keywordOverview(request);
  for (const item of items) {
    if (!item.keyword) continue;
    metricsMap.set(item.keyword.toLowerCase(), {
      searchVolume: item.keyword_info?.search_volume ?? null,
      cpc: item.keyword_info?.cpc ?? null,
      competition: item.keyword_info?.competition ?? null,
      keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
      intent: normalizeIntent(item.search_intent_info?.main_intent),
      monthlySearchesJson: toMonthlySearchesJson(
        item.keyword_info?.monthly_searches,
      ),
    });
  }
  return metricsMap;
}

export async function refreshSavedKeywordMetrics(
  input: RefreshSavedKeywordMetricsInput,
  billingCustomer: BillingCustomerContext,
): Promise<{ updated: number }> {
  const { rows } = await KeywordResearchRepository.listSavedKeywordsByProject({
    projectId: input.projectId,
  });

  if (rows.length === 0) return { updated: 0 };

  const client = createDataforseoClient(billingCustomer);
  let updated = 0;

  // Group by (locationCode, languageCode) so each DataForSEO call is homogeneous.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.row.locationCode}:${row.row.languageCode}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const groupRows of groups.values()) {
    const { locationCode, languageCode } = groupRows[0].row;
    const useGoogleAds = getKeywordDataProvider(locationCode) === "google_ads";

    for (let i = 0; i < groupRows.length; i += REFRESH_BATCH_SIZE) {
      const batch = groupRows.slice(i, i + REFRESH_BATCH_SIZE);
      const keywords = batch.map((r) => r.row.keyword);
      const request = { keywords, locationCode, languageCode };

      const metricsMap = await fetchBatchMetrics(client, request, useGoogleAds);

      await Promise.all(
        batch.map((r) => {
          const metrics = metricsMap.get(r.row.keyword.toLowerCase());
          if (!metrics) return Promise.resolve();
          return KeywordResearchRepository.upsertKeywordMetric({
            projectId: input.projectId,
            keyword: r.row.keyword,
            locationCode,
            languageCode,
            searchVolume: metrics.searchVolume,
            cpc: metrics.cpc,
            competition: metrics.competition,
            keywordDifficulty: metrics.keywordDifficulty,
            intent: metrics.intent,
            monthlySearchesJson: metrics.monthlySearchesJson,
          });
        }),
      );

      updated += metricsMap.size;
    }
  }

  return { updated };
}
