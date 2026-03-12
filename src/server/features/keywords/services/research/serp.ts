import {
  fetchLiveSerpItemsRaw,
  type SerpLiveItem,
} from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";
import type { SerpResultItem } from "@/types/keywords";
import { z } from "zod";
import { normalizeKeyword } from "./helpers";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

type SerpAnalysisReason = "no_organic_results";

type SerpAnalysisResult = {
  requestedKeyword: string;
  items: SerpResultItem[];
  reason?: SerpAnalysisReason;
};

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
  requestedKeyword: z.string(),
  items: z.array(serpResultItemSchema),
  reason: z.enum(["no_organic_results"]).optional(),
});

function mapOrganicSerpItems(items: SerpLiveItem[]): SerpResultItem[] {
  return items
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
      isNew: false,
      rankChange: null,
    }));
}

async function getSerpLiveAnalysis(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<SerpAnalysisResult> {
  const keyword = normalizeKeyword(input.keyword);

  const cacheKey = buildCacheKey("serp:analysis", {
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = serpCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    return cached.data;
  }

  const liveItems = await fetchLiveSerpItemsRaw(
    keyword,
    input.locationCode,
    input.languageCode,
  );

  const items = mapOrganicSerpItems(liveItems);
  const result: SerpAnalysisResult = { requestedKeyword: keyword, items };
  if (items.length === 0) {
    result.reason = "no_organic_results";
  }

  void setCached(cacheKey, result, SERP_CACHE_TTL_SECONDS).catch((error) => {
    console.error("keywords.serp.cache-write failed:", error);
  });

  return result;
}

export const getSerpAnalysis = getSerpLiveAnalysis;
