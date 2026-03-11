import { fetchHistoricalSerpsRaw } from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";

import type { SerpResultItem } from "@/types/keywords";
import { normalizeKeyword } from "./helpers";
import { z } from "zod";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

const serpResultItemSchema = z.object({
  rank: z.number().int(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  description: z.string(),
  etv: z.number().nullable(),
  estimatedPaidTrafficCost: z.number().nullable(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  isNew: z.boolean(),
  rankChange: z.number().nullable(),
});

const serpCacheSchema = z.object({
  items: z.array(serpResultItemSchema),
});

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

  const cachedRaw = await getCached(cacheKey);
  const cached = serpCacheSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.items.length > 0) {
    return cached.data;
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
