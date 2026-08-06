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
import { normalizeDomainInput, toRelativePath } from "@/server/lib/domainUtils";
import type { RelevantPagesItem } from "@/server/lib/dataforseo";
import { computeHasMore } from "@/server/features/domain/services/pagination";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";
import {
  getGlobalTopMarkets,
  isGlobalLocationCode,
} from "@/shared/domain-global-market";

const DOMAIN_PAGES_PAGE_TTL_SECONDS = 12 * 60 * 60;

export type DomainPagesSortMode = "traffic" | "keywords";
export type DomainPagesSortOrder = "asc" | "desc";

const SORT_FIELD_BY_MODE: Record<DomainPagesSortMode, string> = {
  traffic: "metrics.organic.etv",
  keywords: "metrics.organic.count",
};

type MappedPage = NonNullable<ReturnType<typeof mapPageItem>>;

/** Same fixed-cost merge approach as domainKeywordsPage.ts's global path. */
const GLOBAL_MARKET_FETCH_LIMIT = 200;

function getPageSortValue(
  item: MappedPage,
  sortMode: DomainPagesSortMode,
): number | null {
  switch (sortMode) {
    case "traffic":
      return item.organicTraffic;
    case "keywords":
      return item.keywords;
  }
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  order: DomainPagesSortOrder,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return order === "asc" ? a - b : b - a;
}

function sortMergedPages(
  items: MappedPage[],
  sortMode: DomainPagesSortMode,
  sortOrder: DomainPagesSortOrder,
): MappedPage[] {
  return items.toSorted((a, b) =>
    compareNullableNumber(
      getPageSortValue(a, sortMode),
      getPageSortValue(b, sortMode),
      sortOrder,
    ),
  );
}

const domainPagesPageResultSchema = z.object({
  domain: z.string(),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number().nullable(),
  hasMore: z.boolean(),
  pages: z.array(
    z.object({
      page: z.string(),
      relativePath: z.string().nullable(),
      organicTraffic: z.number().nullable(),
      keywords: z.number().nullable(),
    }),
  ),
  fetchedAt: z.string(),
});

type DomainPagesPageResult = z.infer<typeof domainPagesPageResultSchema>;

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function pushAnd(filters: unknown[], expression: unknown[]) {
  if (filters.length > 0) filters.push("and");
  filters.push(expression);
}

function collectNumericRange(
  out: unknown[][],
  field: string,
  min: number | undefined,
  max: number | undefined,
) {
  if (typeof min === "number" && Number.isFinite(min)) {
    out.push([field, ">=", min]);
  }
  if (typeof max === "number" && Number.isFinite(max)) {
    out.push([field, "<=", max]);
  }
}

function parseTerms(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function buildPageFilters(
  filters: DomainKeywordsFilters,
  searchTerm?: string,
): unknown[] {
  const conditions: unknown[][] = [];

  for (const term of parseTerms(filters.include)) {
    conditions.push(["page_address", "ilike", `%${escapeLikeTerm(term)}%`]);
  }
  for (const term of parseTerms(filters.exclude)) {
    conditions.push(["page_address", "not_ilike", `%${escapeLikeTerm(term)}%`]);
  }

  collectNumericRange(
    conditions,
    "metrics.organic.etv",
    filters.minTraffic,
    filters.maxTraffic,
  );
  collectNumericRange(
    conditions,
    "metrics.organic.count",
    filters.minVol,
    filters.maxVol,
  );

  const trimmed = searchTerm?.trim();
  if (trimmed) {
    conditions.push(["page_address", "ilike", `%${escapeLikeTerm(trimmed)}%`]);
  }

  const expressions: unknown[] = [];
  for (const condition of conditions) pushAnd(expressions, condition);
  return expressions;
}

function mapPageItem(item: RelevantPagesItem) {
  const url = item.page_address ?? null;
  if (!url) return null;
  const organic = item.metrics?.organic ?? null;
  const traffic = organic?.etv ?? null;
  const keywords = organic?.count ?? null;
  return {
    page: url,
    relativePath: toRelativePath(url),
    organicTraffic: traffic != null ? Math.round(traffic) : null,
    keywords: keywords != null ? Math.round(keywords) : null,
  };
}

async function fetchGlobalPages(
  dataforseo: ReturnType<typeof createDataforseoClient>,
  target: string,
  orderBy: string[],
  filters: unknown[],
): Promise<MappedPage[]> {
  const perMarket = await Promise.all(
    getGlobalTopMarkets().map((market) =>
      dataforseo.domain.relevantPages({
        target,
        locationCode: market.locationCode,
        languageCode: market.languageCode,
        limit: GLOBAL_MARKET_FETCH_LIMIT,
        orderBy,
        filters: filters.length > 0 ? filters : undefined,
      }),
    ),
  );

  const merged = new Map<string, MappedPage>();
  for (const response of perMarket) {
    for (const item of response.items) {
      const mapped = mapPageItem(item);
      if (!mapped) continue;
      const existing = merged.get(mapped.page);
      if (!existing || (mapped.organicTraffic ?? 0) > (existing.organicTraffic ?? 0)) {
        merged.set(mapped.page, mapped);
      }
    }
  }
  return [...merged.values()];
}

type ClearPagesPageCacheInput = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
  languageCode: string;
  page: number;
  pageSize: number;
  sortMode: DomainPagesSortMode;
  sortOrder: DomainPagesSortOrder;
  filters: DomainKeywordsFilters;
  search?: string;
};

/** Deletes the cached page entry (mirrors getPagesPage's cache key exactly) so the next lookup is a fresh DataForSEO fetch. */
export async function clearPagesPageCache(
  input: ClearPagesPageCacheInput,
  billingCustomer: BillingCustomerContext,
): Promise<void> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const cacheKey = await buildCacheKey("domain:pages-page", {
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

export async function getPagesPage(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
    page: number;
    pageSize: number;
    sortMode: DomainPagesSortMode;
    sortOrder: DomainPagesSortOrder;
    filters: DomainKeywordsFilters;
    search?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<DomainPagesPageResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const offset = (input.page - 1) * input.pageSize;
  const orderBy = [`${SORT_FIELD_BY_MODE[input.sortMode]},${input.sortOrder}`];
  const filters = buildPageFilters(input.filters, input.search);

  const cacheKey = await buildCacheKey("domain:pages-page", {
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
  const cached = domainPagesPageResultSchema.safeParse(cachedRaw);
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  let pages: MappedPage[];
  let totalCount: number | null;
  let fetchedCount: number;

  if (isGlobalLocationCode(input.locationCode)) {
    const merged = sortMergedPages(
      await fetchGlobalPages(dataforseo, domain, orderBy, filters),
      input.sortMode,
      input.sortOrder,
    );
    totalCount = merged.length;
    pages = merged.slice(offset, offset + input.pageSize);
    fetchedCount = pages.length;
  } else {
    const response = await dataforseo.domain.relevantPages({
      target: domain,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      limit: input.pageSize,
      offset,
      orderBy,
      filters: filters.length > 0 ? filters : undefined,
    });

    pages = response.items
      .map(mapPageItem)
      .filter(
        (item): item is NonNullable<ReturnType<typeof mapPageItem>> =>
          item != null,
      );
    totalCount = response.totalCount;
    fetchedCount = response.items.length;
  }

  const hasMore = computeHasMore(offset, fetchedCount, totalCount, input.pageSize);

  const result: DomainPagesPageResult = {
    domain,
    page: input.page,
    pageSize: input.pageSize,
    totalCount,
    hasMore,
    pages,
    fetchedAt: new Date().toISOString(),
  };

  // waitUntil, not void: workerd cancels unregistered pending I/O once the
  // response is sent, so a fire-and-forget put never persists the cache.
  waitUntil(
    setCached(cacheKey, result, DOMAIN_PAGES_PAGE_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.pages-page.cache-write failed:", error);
      },
    ),
  );

  return result;
}
