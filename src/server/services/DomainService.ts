import {
  normalizeDomainInput,
  toRelativePath,
  fetchDomainRankOverviewRaw,
  fetchRankedKeywordsRaw,
  type DomainRankedKeywordItem,
} from "@/server/lib/dataforseo";
import { sortBy } from "remeda";
import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";
import { z } from "zod";

/** Domain overview data is refreshed every 12 hours. */
const DOMAIN_OVERVIEW_TTL_SECONDS = 12 * 60 * 60;

type DomainOverviewResult = {
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  hasData: boolean;
  keywords: Array<{
    keyword: string;
    position: number | null;
    searchVolume: number | null;
    traffic: number | null;
    cpc: number | null;
    url: string | null;
    relativeUrl: string | null;
    keywordDifficulty: number | null;
  }>;
  pages: Array<{
    page: string;
    relativePath: string | null;
    organicTraffic: number | null;
    keywords: number | null;
    backlinks: number | null;
  }>;
  fetchedAt: string;
};

const domainKeywordSchema = z.object({
  keyword: z.string(),
  position: z.number().nullable(),
  searchVolume: z.number().nullable(),
  traffic: z.number().nullable(),
  cpc: z.number().nullable(),
  url: z.string().nullable(),
  relativeUrl: z.string().nullable(),
  keywordDifficulty: z.number().nullable(),
});

const domainPageSchema = z.object({
  page: z.string(),
  relativePath: z.string().nullable(),
  organicTraffic: z.number().nullable(),
  keywords: z.number().nullable(),
  backlinks: z.number().nullable(),
});

const domainOverviewSchema = z.object({
  domain: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  hasData: z.boolean(),
  keywords: z.array(domainKeywordSchema),
  pages: z.array(domainPageSchema),
  fetchedAt: z.string(),
});

async function getOverview(input: {
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
  languageCode: string;
}): Promise<DomainOverviewResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);

  // --- KV cache check ---
  const cacheKey = buildCacheKey("domain:overview", {
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainOverviewSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.hasData) {
    return cached.data;
  }

  // --- Fetch fresh from DataForSEO ---
  const nowIso = new Date().toISOString();

  const [metricsResponse, rankedKeywordsResponse] = await Promise.all([
    fetchDomainRankOverviewRaw(domain, input.locationCode, input.languageCode),
    fetchRankedKeywordsRaw(
      domain,
      input.locationCode,
      input.languageCode,
      200,
      ["keyword_data.keyword_info.search_volume,desc"],
    ),
  ]);

  const metrics = metricsResponse[0];
  const rankedItems = rankedKeywordsResponse;

  const keywords = rankedItems
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    );

  const pages = derivePages(keywords);

  const organicTraffic =
    metrics?.metrics?.organic?.etv != null
      ? Math.round(metrics.metrics.organic.etv)
      : null;
  const organicKeywords =
    metrics?.metrics?.organic?.count != null
      ? Math.round(metrics.metrics.organic.count)
      : null;

  const result: DomainOverviewResult = {
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: null,
    referringDomains: null,
    hasData: keywords.length > 0,
    keywords,
    pages,
    fetchedAt: nowIso,
  };

  // Persist to KV (fire-and-forget; don't block response)
  if (result.hasData) {
    void setCached(cacheKey, result, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.overview.cache-write failed:", error);
      },
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapKeywordItem(item: DomainRankedKeywordItem) {
  const keywordData = item.keyword_data;
  const keywordInfo = keywordData?.keyword_info;
  const keywordProperties = keywordData?.keyword_properties;
  const rankedSerpElement = item.ranked_serp_element;
  const serpItem = rankedSerpElement?.serp_item;

  const keyword = keywordData?.keyword ?? item.keyword;
  if (!keyword) return null;

  const url = serpItem?.url ?? rankedSerpElement?.url ?? null;

  const relativeUrl =
    serpItem?.relative_url ??
    rankedSerpElement?.relative_url ??
    (url ? toRelativePath(url) : null);

  const position =
    serpItem?.rank_absolute ?? rankedSerpElement?.rank_absolute ?? null;

  const traffic = serpItem?.etv ?? rankedSerpElement?.etv ?? null;

  const keywordDifficulty =
    keywordProperties?.keyword_difficulty ??
    keywordInfo?.keyword_difficulty ??
    null;

  return {
    keyword,
    position: position != null ? Math.round(position) : null,
    searchVolume:
      keywordInfo?.search_volume != null
        ? Math.round(keywordInfo.search_volume)
        : null,
    traffic: traffic ?? null,
    cpc: keywordInfo?.cpc ?? null,
    url: url ?? null,
    relativeUrl,
    keywordDifficulty:
      keywordDifficulty != null ? Math.round(keywordDifficulty) : null,
  };
}

function derivePages(
  keywords: Array<{
    url: string | null;
    relativeUrl: string | null;
    traffic: number | null;
  }>,
) {
  const grouped = new Map<
    string,
    {
      page: string;
      relativePath: string | null;
      traffic: number;
      keywords: number;
    }
  >();

  for (const keyword of keywords) {
    if (!keyword.url) continue;

    const existing = grouped.get(keyword.url) ?? {
      page: keyword.url,
      relativePath: keyword.relativeUrl,
      traffic: 0,
      keywords: 0,
    };

    existing.traffic += keyword.traffic ?? 0;
    existing.keywords += 1;

    grouped.set(keyword.url, existing);
  }

  return sortBy(Array.from(grouped.values()), [(page) => page.traffic, "desc"])
    .slice(0, 100)
    .map((page) => ({
      page: page.page,
      relativePath: page.relativePath,
      organicTraffic: page.traffic,
      keywords: page.keywords,
      backlinks: null,
    }));
}

export const DomainService = {
  getOverview,
} as const;
