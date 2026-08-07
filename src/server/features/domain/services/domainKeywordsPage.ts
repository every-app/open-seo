import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  buildCacheKey,
  deleteCached,
  getCached,
  setCached,
} from "@/server/lib/r2-cache";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { computeHasMore } from "@/server/features/domain/services/pagination";
import {
  buildKeywordFilters,
  buildOrderBy,
  type DomainKeywordsSortMode,
  type DomainKeywordsSortOrder,
} from "@/server/features/domain/services/domainKeywordFilters";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";
import {
  getGlobalTopMarkets,
  isGlobalLocationCode,
} from "@/shared/domain-global-market";

const DOMAIN_KEYWORDS_PAGE_TTL_SECONDS = 12 * 60 * 60;

type MappedKeyword = NonNullable<ReturnType<typeof mapKeywordItem>>;

/**
 * Global has no worldwide endpoint, so each top market is asked for its own
 * best `GLOBAL_MARKET_FETCH_LIMIT` rows (already filtered/sorted
 * server-side by DataForSEO), then the candidates are merged, deduped by
 * keyword (keeping the highest-traffic instance), and re-sorted locally
 * before being paginated in-memory. `totalCount` is therefore the size of
 * this merged/deduped set, not a true cross-country total.
 */
const GLOBAL_MARKET_FETCH_LIMIT = 200;

function getKeywordSortValue(
  item: MappedKeyword,
  sortMode: DomainKeywordsSortMode,
): number | null {
  switch (sortMode) {
    case "rank":
      return item.position;
    case "traffic":
      return item.traffic;
    case "volume":
      return item.searchVolume;
    case "score":
      return item.keywordDifficulty;
    case "cpc":
      return item.cpc;
  }
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  order: DomainKeywordsSortOrder,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return order === "asc" ? a - b : b - a;
}

function sortMergedKeywords(
  items: MappedKeyword[],
  sortMode: DomainKeywordsSortMode,
  sortOrder: DomainKeywordsSortOrder,
): MappedKeyword[] {
  return items.toSorted((a, b) =>
    compareNullableNumber(
      getKeywordSortValue(a, sortMode),
      getKeywordSortValue(b, sortMode),
      sortOrder,
    ),
  );
}

async function fetchGlobalKeywords(
  dataforseo: ReturnType<typeof createDataforseoClient>,
  target: string,
  orderBy: string[],
  filters: unknown[],
): Promise<MappedKeyword[]> {
  const perMarket = await Promise.all(
    getGlobalTopMarkets().map((market) =>
      dataforseo.domain.rankedKeywords({
        target,
        locationCode: market.locationCode,
        languageCode: market.languageCode,
        limit: GLOBAL_MARKET_FETCH_LIMIT,
        orderBy,
        filters: filters.length > 0 ? filters : undefined,
      }),
    ),
  );

  const merged = new Map<string, MappedKeyword>();
  for (const response of perMarket) {
    for (const item of response.items) {
      const mapped = mapKeywordItem(item);
      if (!mapped) continue;
      const existing = merged.get(mapped.keyword);
      if (!existing || (mapped.traffic ?? 0) > (existing.traffic ?? 0)) {
        merged.set(mapped.keyword, mapped);
      }
    }
  }
  return [...merged.values()];
}

const domainKeywordsPageResultSchema = z.object({
  domain: z.string(),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number().nullable(),
  hasMore: z.boolean(),
  keywords: z.array(
    z.object({
      keyword: z.string(),
      position: z.number().nullable(),
      searchVolume: z.number().nullable(),
      traffic: z.number().nullable(),
      cpc: z.number().nullable(),
      url: z.string().nullable(),
      relativeUrl: z.string().nullable(),
      keywordDifficulty: z.number().nullable(),
    }),
  ),
  fetchedAt: z.string(),
});

type DomainKeywordsPageResult = z.infer<typeof domainKeywordsPageResultSchema>;

type ClearKeywordsPageCacheInput = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
  languageCode: string;
  page: number;
  pageSize: number;
  sortMode: DomainKeywordsSortMode;
  sortOrder: DomainKeywordsSortOrder;
  filters: DomainKeywordsFilters;
  search?: string;
};

/** Deletes the cached page entry (mirrors getKeywordsPage's cache key exactly) so the next lookup is a fresh DataForSEO fetch. */
export async function clearKeywordsPageCache(
  input: ClearKeywordsPageCacheInput,
  billingCustomer: BillingCustomerContext,
): Promise<void> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const cacheKey = await buildCacheKey("domain:keywords-page", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    page: input.page,
    pageSize: input.pageSize,
    sortMode: input.sortMode,
    sortOrder: input.sortOrder,
    filters: input.filters,
    search: input.search,
  });
  await deleteCached(cacheKey);
}

export async function getKeywordsPage(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
    page: number;
    pageSize: number;
    sortMode: DomainKeywordsSortMode;
    sortOrder: DomainKeywordsSortOrder;
    filters: DomainKeywordsFilters;
    search?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<DomainKeywordsPageResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const offset = (input.page - 1) * input.pageSize;
  const orderBy = buildOrderBy(input.sortMode, input.sortOrder);
  const filters = buildKeywordFilters(input.filters, input.search);

  const cacheKey = await buildCacheKey("domain:keywords-page", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    page: input.page,
    pageSize: input.pageSize,
    sortMode: input.sortMode,
    sortOrder: input.sortOrder,
    filters: input.filters,
    search: input.search,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainKeywordsPageResultSchema.safeParse(cachedRaw);
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  let keywords: MappedKeyword[];
  let totalCount: number | null;
  let fetchedCount: number;

  if (isGlobalLocationCode(input.locationCode)) {
    const merged = sortMergedKeywords(
      await fetchGlobalKeywords(dataforseo, domain, orderBy, filters),
      input.sortMode,
      input.sortOrder,
    );
    totalCount = merged.length;
    keywords = merged.slice(offset, offset + input.pageSize);
    fetchedCount = keywords.length;
  } else {
    const response = await dataforseo.domain.rankedKeywords({
      target: domain,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      limit: input.pageSize,
      offset,
      orderBy,
      filters: filters.length > 0 ? filters : undefined,
    });

    keywords = response.items
      .map((item) => mapKeywordItem(item))
      .filter(
        (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
          item != null,
      );
    totalCount = response.totalCount;
    fetchedCount = response.items.length;
  }

  const hasMore = computeHasMore(offset, fetchedCount, totalCount, input.pageSize);

  const result: DomainKeywordsPageResult = {
    domain,
    page: input.page,
    pageSize: input.pageSize,
    totalCount,
    hasMore,
    keywords,
    fetchedAt: new Date().toISOString(),
  };

  // waitUntil, not void: workerd cancels unregistered pending I/O once the
  // response is sent, so a fire-and-forget put never persists the cache.
  waitUntil(
    setCached(cacheKey, result, DOMAIN_KEYWORDS_PAGE_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.keywords-page.cache-write failed:", error);
      },
    ),
  );

  return result;
}
