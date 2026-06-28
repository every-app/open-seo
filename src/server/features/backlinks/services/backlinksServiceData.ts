import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
  type BacklinksHistoryItem,
  type BacklinksItem,
  type BacklinksSummaryItem,
  type DomainPageSummaryItem,
  type ReferringDomainItem,
} from "@/server/lib/dataforseo";
import type {
  BacklinksLookupInput,
  BacklinksRowsPageInput,
  BacklinksSpamFilterOptions,
  ReferringDomainsPageInput,
  TopPagesPageInput,
} from "@/types/schemas/backlinks";

import {
  backlinksOverviewSchema,
  backlinksRowsPageResultSchema,
  referringDomainsPageResultSchema,
  topPagesPageResultSchema,
  type BacklinksOverviewResult,
  type BacklinksRowsPageResult,
  type ReferringDomainsPageResult,
  type TopPagesPageResult,
} from "@/server/features/backlinks/services/backlinksOverviewSchema";
import {
  buildBacklinksRowsApiFilters,
  buildBacklinksRowsOrderBy,
  buildReferringDomainsApiFilters,
  buildReferringDomainsOrderBy,
  buildTopPagesApiFilters,
  buildTopPagesOrderBy,
} from "@/server/features/backlinks/services/backlinksApiFilters";

// The page-request schemas carry projectId for the web middleware; the
// service layer is organization-scoped and never reads it.
export type BacklinksRowsPageServiceInput = Omit<
  BacklinksRowsPageInput,
  "projectId"
>;
export type ReferringDomainsPageServiceInput = Omit<
  ReferringDomainsPageInput,
  "projectId"
>;
export type TopPagesPageServiceInput = Omit<TopPagesPageInput, "projectId">;

const BACKLINKS_OVERVIEW_TTL_SECONDS = 6 * 60 * 60;
const BACKLINKS_TAB_TTL_SECONDS = 6 * 60 * 60;

const backlinksOverviewCacheSchema = z.object({
  overview: backlinksOverviewSchema,
});

export type BacklinksCache = {
  get(key: string): Promise<unknown>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
};

type BacklinksOverviewProfile = {
  overview: BacklinksOverviewResult;
};

type BacklinksDateRange = {
  dateFrom: string;
  dateTo: string;
};

export async function profileBacklinksOverview(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<BacklinksOverviewProfile> {
  const cached = backlinksOverviewCacheSchema.safeParse(
    await cache.get(cacheKey),
  );
  if (cached.success) {
    return {
      overview: cached.data.overview,
    };
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const now = new Date();
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  const dateRange = buildBacklinksDateRange(now);

  const [summary, history] = await Promise.all([
    dataforseo.backlinks.summary({
      target: normalizedTarget.apiTarget,
      creditFeature,
    }),
    normalizedTarget.scope === "domain"
      ? dataforseo.backlinks.history({
          target: normalizedTarget.apiTarget,
          ...dateRange,
          creditFeature,
        })
      : Promise.resolve([]),
  ]);

  const overview = buildOverviewResult({
    normalizedTarget,
    now,
    summary,
    history,
  });
  await cacheValue(
    cache,
    cacheKey,
    { overview },
    BACKLINKS_OVERVIEW_TTL_SECONDS,
  );

  return { overview };
}

export async function profileBacklinksRowsPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksRowsPageServiceInput,
  billingCustomer: BillingCustomerContext,
  spamOptions?: BacklinksSpamFilterOptions,
): Promise<BacklinksRowsPageResult> {
  const cached = backlinksRowsPageResultSchema.safeParse(
    await cache.get(cacheKey),
  );
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildBacklinksRowsApiFilters(input.filters);

  const response = await dataforseo.backlinks.rows({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildBacklinksRowsOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
    mode: input.mode,
    ...spamOptions,
  });

  const result = buildPageResult(input, offset, {
    rows: mapBacklinksRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

export async function profileReferringDomainsPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: ReferringDomainsPageServiceInput,
  billingCustomer: BillingCustomerContext,
  spamOptions?: BacklinksSpamFilterOptions,
): Promise<ReferringDomainsPageResult> {
  const cached = referringDomainsPageResultSchema.safeParse(
    await cache.get(cacheKey),
  );
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildReferringDomainsApiFilters(input.filters);

  const response = await dataforseo.backlinks.referringDomains({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildReferringDomainsOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
    ...spamOptions,
  });

  const result = buildPageResult(input, offset, {
    rows: mapReferringDomainsRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

export async function profileTopPagesPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: TopPagesPageServiceInput,
  billingCustomer: BillingCustomerContext,
): Promise<TopPagesPageResult> {
  const cached = topPagesPageResultSchema.safeParse(await cache.get(cacheKey));
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildTopPagesApiFilters(input.filters);

  const response = await dataforseo.backlinks.domainPages({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildTopPagesOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
  });

  const result = buildPageResult(input, offset, {
    rows: mapTopPagesRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

function buildPageResult<TRow>(
  input: { page: number; pageSize: number },
  offset: number,
  data: { rows: TRow[]; totalCount: number | null },
) {
  const hasMore =
    data.totalCount != null
      ? offset + data.rows.length < data.totalCount
      : data.rows.length === input.pageSize;

  return {
    rows: data.rows,
    totalCount: data.totalCount,
    hasMore,
    page: input.page,
    pageSize: input.pageSize,
    fetchedAt: new Date().toISOString(),
  };
}

function buildBacklinksDateRange(now: Date): BacklinksDateRange {
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dateToUtc = new Date(todayUtc);
  dateToUtc.setUTCDate(dateToUtc.getUTCDate() - 1);

  const dateFromUtc = new Date(dateToUtc);
  dateFromUtc.setUTCFullYear(dateFromUtc.getUTCFullYear() - 1);

  return {
    dateFrom: dateFromUtc.toISOString().slice(0, 10),
    dateTo: dateToUtc.toISOString().slice(0, 10),
  };
}

function buildOverviewResult(args: {
  normalizedTarget: ReturnType<typeof normalizeBacklinksTarget>;
  now: Date;
  summary: BacklinksSummaryItem;
  history: BacklinksHistoryItem[];
}): BacklinksOverviewResult {
  const historyRows = args.history
    .map((item) => ({
      date: normalizeHistoryDate(item.date),
      backlinks: item.backlinks ?? null,
      referringDomains: item.referring_domains ?? null,
      rank: item.rank ?? null,
      newBacklinks: item.new_backlinks ?? null,
      lostBacklinks: item.lost_backlinks ?? null,
      newReferringDomains:
        item.new_referring_domains ?? item.new_reffering_domains ?? null,
      lostReferringDomains:
        item.lost_referring_domains ?? item.lost_reffering_domains ?? null,
    }))
    .filter(
      (
        item,
      ): item is typeof item & {
        date: string;
      } => item.date !== null,
    );

  return {
    target: args.normalizedTarget.apiTarget,
    displayTarget: args.normalizedTarget.displayTarget,
    scope: args.normalizedTarget.scope,
    summary: {
      rank: args.summary.rank ?? null,
      backlinks: args.summary.backlinks ?? null,
      referringPages: args.summary.referring_pages ?? null,
      referringDomains: args.summary.referring_domains ?? null,
      brokenBacklinks: args.summary.broken_backlinks ?? null,
      brokenPages: args.summary.broken_pages ?? null,
      backlinksSpamScore: args.summary.backlinks_spam_score ?? null,
      targetSpamScore: args.summary.info?.target_spam_score ?? null,
      newBacklinks: args.summary.new_backlinks ?? null,
      lostBacklinks: args.summary.lost_backlinks ?? null,
      newReferringDomains:
        args.summary.new_referring_domains ??
        args.summary.new_reffering_domains ??
        null,
      lostReferringDomains:
        args.summary.lost_referring_domains ??
        args.summary.lost_reffering_domains ??
        null,
    },
    trends: historyRows.map((item) => ({
      date: item.date,
      backlinks: item.backlinks,
      referringDomains: item.referringDomains,
      rank: item.rank,
    })),
    newLostTrends: historyRows.map((item) => ({
      date: item.date,
      newBacklinks: item.newBacklinks,
      lostBacklinks: item.lostBacklinks,
      newReferringDomains: item.newReferringDomains,
      lostReferringDomains: item.lostReferringDomains,
    })),
    fetchedAt: args.now.toISOString(),
  };
}

function normalizeHistoryDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function mapBacklinksRows(rows: BacklinksItem[]) {
  return rows.map((item) => ({
    domainFrom: item.domain_from ?? null,
    urlFrom: item.url_from ?? null,
    urlTo: item.url_to ?? null,
    anchor: item.anchor ?? null,
    itemType: item.item_type ?? null,
    isDofollow: item.dofollow ?? null,
    relAttributes: item.rel_attributes ?? item.attributes ?? [],
    rank: item.rank ?? null,
    domainFromRank: item.domain_from_rank ?? null,
    pageFromRank: item.page_from_rank ?? null,
    spamScore: item.backlink_spam_score ?? item.backlinks_spam_score ?? null,
    firstSeen: item.first_seen ?? null,
    lastSeen: item.lost_date ?? item.last_visited ?? null,
    isLost: item.is_lost ?? Boolean(item.lost_date),
    isBroken: item.is_broken ?? false,
    linksCount: item.links_count ?? null,
  }));
}

function mapReferringDomainsRows(rows: ReferringDomainItem[]) {
  return rows.map((item) => ({
    domain: item.domain ?? null,
    backlinks: item.backlinks ?? null,
    referringPages: item.referring_pages ?? null,
    rank: item.rank ?? null,
    spamScore: item.backlinks_spam_score ?? null,
    firstSeen: item.first_seen ?? null,
    brokenBacklinks: item.broken_backlinks ?? null,
    brokenPages: item.broken_pages ?? null,
  }));
}

function mapTopPagesRows(rows: DomainPageSummaryItem[]) {
  return rows.map((item) => ({
    page: item.page ?? item.url ?? null,
    backlinks: item.backlinks ?? null,
    referringDomains: item.referring_domains ?? null,
    rank: item.rank ?? null,
    brokenBacklinks: item.broken_backlinks ?? null,
  }));
}

async function cacheValue(
  cache: BacklinksCache,
  key: string,
  data: unknown,
  ttlSeconds: number,
) {
  await cache.set(key, data, ttlSeconds).catch((error: unknown) => {
    console.error("backlinks.cache-write failed:", error);
  });
}
