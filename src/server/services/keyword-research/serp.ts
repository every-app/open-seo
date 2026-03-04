import { fetchHistoricalSerpsRaw } from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";

import type { SerpResultItem } from "@/types/keywords";
import { normalizeKeyword } from "./helpers";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

export async function getSerpAnalysis(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<{ items: SerpResultItem[] }> {
  const keyword = normalizeKeyword(input.keyword);

  const cacheKey = buildCacheKey("serp:analysis", {
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = await getCached<{ items: SerpResultItem[] }>(cacheKey);
  if (cached && cached.items.length > 0) {
    return cached;
  }

  const snapshots = await fetchHistoricalSerpsRaw(
    keyword,
    input.locationCode,
    input.languageCode,
  );

  const snapshot = snapshots[0];
  const rawItems = snapshot?.items ?? [];

  const items: SerpResultItem[] = rawItems
    .filter((item) => item.type === "organic")
    .map((item) => ({
      rank: item.rank_absolute ?? item.rank_group ?? 0,
      title: item.title ?? "",
      url: item.url ?? "",
      domain: item.domain ?? "",
      description: item.description ?? "",
      etv: item.etv ?? null,
      estimatedPaidTrafficCost: item.estimated_paid_traffic_cost ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      isNew: item.rank_changes?.is_new ?? false,
      rankChange:
        item.rank_changes?.previous_rank_absolute != null &&
        item.rank_absolute != null
          ? item.rank_changes.previous_rank_absolute - item.rank_absolute
          : null,
    }));

  const result = { items };

  if (items.length > 0) {
    void setCached(cacheKey, result, SERP_CACHE_TTL_SECONDS).catch((error) => {
      console.error("keywords.serp.cache-write failed:", error);
    });
  }

  return result;
}
