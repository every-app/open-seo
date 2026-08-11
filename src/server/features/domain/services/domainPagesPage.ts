import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { normalizeDomainInput, toRelativePath } from "@/server/lib/domainUtils";
import type { RelevantPagesItem } from "@/server/lib/dataforseo";
import { getSeoDataRouter } from "@/server/lib/seo-data";
import { computeHasMore } from "@/server/features/domain/services/pagination";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";

type DomainPagesSortMode = "traffic" | "keywords";
type DomainPagesSortOrder = "asc" | "desc";

const SORT_FIELD_BY_MODE: Record<DomainPagesSortMode, string> = {
  traffic: "metrics.organic.etv",
  keywords: "metrics.organic.count",
};

/** Loose passthrough schema for the raw router payload. The router validates
 *  cached data against this, so stale schema versions are treated as a miss. */
const domainPagesRouterDataSchema = z.object({
  items: z.array(z.unknown()),
  totalCount: z.number().nullable(),
});

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

  const response = await getSeoDataRouter().route<{
    items: RelevantPagesItem[];
    totalCount: number | null;
  }>(
    {
      dataType: "domain_pages",
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
    domainPagesRouterDataSchema,
  );

  const pages = response.data.items
    .map(mapPageItem)
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapPageItem>> =>
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
    pages,
    fetchedAt: new Date().toISOString(),
  };
}
