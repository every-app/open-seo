import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { normalizeIntent } from "@/server/features/keywords/services/research/helpers";
import {
  createDataforseoClient,
  fetchKeywordMetricsForList,
} from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { RefreshSavedKeywordMetricsInput } from "@/types/schemas/keywords";

// Cap concurrent D1 upserts per group. A project can accumulate thousands of
// saved keywords in one location/language, and fanning out one promise each
// would flood D1/Worker resources; write in bounded chunks instead.
const REFRESH_UPSERT_BATCH_SIZE = 100;

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

  // Group by (locationCode, languageCode) so each provider call is homogeneous.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.row.locationCode}:${row.row.languageCode}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const groupRows of groups.values()) {
    const { locationCode, languageCode } = groupRows[0].row;
    const metrics = await fetchKeywordMetricsForList(client, {
      keywords: groupRows.map((r) => r.row.keyword),
      locationCode,
      languageCode,
      creditFeature: "keyword_research",
    });
    const byKeyword = new Map(
      metrics.map((metric) => [metric.keyword.toLowerCase(), metric]),
    );

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
            keywordDifficulty: metric.keywordDifficulty,
            intent: normalizeIntent(metric.intent),
            monthlySearchesJson: JSON.stringify(metric.monthlySearches),
          });
        }),
      );
    }

    updated += byKeyword.size;
  }

  return { updated };
}
