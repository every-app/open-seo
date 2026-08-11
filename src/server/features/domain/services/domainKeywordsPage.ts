import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { getSeoDataRouter } from "@/server/lib/seo-data";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { computeHasMore } from "@/server/features/domain/services/pagination";
import {
  buildKeywordFilters,
  buildOrderBy,
  type DomainKeywordsSortMode,
  type DomainKeywordsSortOrder,
} from "@/server/features/domain/services/domainKeywordFilters";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";

/** Loose passthrough schema for the raw router payload. The router validates
 *  cached data against this, so stale schema versions are treated as a miss. */
const domainKeywordsRouterDataSchema = z.object({
  items: z.array(z.unknown()),
  totalCount: z.number().nullable(),
});

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

  const response = await getSeoDataRouter().route<{
    items: Parameters<typeof mapKeywordItem>[0][];
    totalCount: number | null;
  }>(
    {
      dataType: "domain_keywords",
      domain,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      billingCustomer,
      constraints: {
        limit: input.pageSize,
        offset,
        orderBy,
        ...(filters.length > 0 ? { filters } : {}),
        includeSubdomains: input.includeSubdomains,
        projectId: input.projectId,
      },
    },
    domainKeywordsRouterDataSchema,
  );

  const keywords = response.data.items
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    );

  const totalCount = response.data.totalCount;
  const hasMore = computeHasMore(
    offset,
    response.data.items.length,
    totalCount,
    input.pageSize,
  );

  return {
    domain,
    page: input.page,
    pageSize: input.pageSize,
    totalCount,
    hasMore,
    keywords,
    fetchedAt: new Date().toISOString(),
  };
}
