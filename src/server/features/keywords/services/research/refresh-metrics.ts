import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { normalizeIntent } from "@/server/features/keywords/services/research/helpers";
import { fetchGoogleAdsMetricsForList, hasGoogleAdsCredentials } from "@/server/lib/keyword-providers/google-ads";
import { fetchBingKeywordData, hasBingCredentials } from "@/server/lib/keyword-providers/bing";
import { AppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { RefreshSavedKeywordMetricsInput } from "@/types/schemas/keywords";

// Cap concurrent D1 upserts per group. A project can accumulate thousands of
// saved keywords in one location/language, and fanning out one promise each
// would flood D1/Worker resources; write in bounded chunks instead.
const REFRESH_UPSERT_BATCH_SIZE = 100;

export async function refreshSavedKeywordMetrics(
  input: RefreshSavedKeywordMetricsInput,
  _billingCustomer: BillingCustomerContext,
): Promise<{ updated: number }> {
  const { rows } = await KeywordResearchRepository.listSavedKeywordsByProject({
    projectId: input.projectId,
  });

  if (rows.length === 0) return { updated: 0 };

  // Group by (locationCode, languageCode) so each provider call is homogeneous.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.row.locationCode}:${row.row.languageCode}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  let updated = 0;

  for (const groupRows of groups.values()) {
    const { locationCode, languageCode } = groupRows[0].row;
    const keywords = groupRows.map((r) => r.row.keyword);

    // Google Ads (historical metrics) first; Bing stats as the fallback.
    // Neither provider exposes difficulty or intent, so those stay null /
    // "unknown" — same as the retired DataForSEO refresh path tolerated.
    let byKeyword = new Map<
      string,
      {
        searchVolume: number | null;
        cpc: number | null;
        competition: number | null;
      }
    >();

    if (await hasGoogleAdsCredentials()) {
      const metrics = await fetchGoogleAdsMetricsForList({
        keywords,
        locationCode,
        languageCode,
      });
      byKeyword = new Map(
        metrics.map((metric) => [
          metric.keyword.toLowerCase(),
          {
            searchVolume: metric.searchVolume,
            cpc: metric.cpc,
            competition: metric.competition,
          },
        ]),
      );
    } else if (await hasBingCredentials()) {
      // Bing stats are per-seed-keyword; run one query per keyword.
      for (const keyword of keywords) {
        const stats = await fetchBingKeywordData({
          seedKeyword: keyword,
          languageCode,
          locationCode,
          resultLimit: 1,
        });
        const exact = stats.find(
          (row) => row.keyword.toLowerCase() === keyword.toLowerCase(),
        );
        if (exact) {
          byKeyword.set(keyword.toLowerCase(), {
            searchVolume: exact.searchVolume,
            cpc: exact.cpc,
            competition: exact.competition,
          });
        }
      }
    } else {
      throw new AppError(
        "DATAFORSEO_AUTH_FAILED",
        "No keyword data provider configured. Set Google Ads (GOOGLE_ADS_*) or Bing Webmaster (BING_WEBMASTER_API_KEY) environment variables.",
      );
    }

    for (let i = 0; i < groupRows.length; i += REFRESH_UPSERT_BATCH_SIZE) {
      const chunk = groupRows.slice(i, i + REFRESH_UPSERT_BATCH_SIZE);
      await Promise.all(
        chunk.map((r) => {
          const metric = byKeyword.get(r.row.keyword.toLowerCase());
          if (!metric) return Promise.resolve();
          return KeywordResearchRepository.upsertKeywordMetric({
            projectId: input.projectId,
            keyword: r.row.keyword,
            locationCode,
            languageCode,
            searchVolume: metric.searchVolume,
            cpc: metric.cpc,
            competition: metric.competition,
            keywordDifficulty: null,
            intent: normalizeIntent(null),
            monthlySearchesJson: JSON.stringify([]),
          });
        }),
      );
    }

    updated += byKeyword.size;
  }

  return { updated };
}
