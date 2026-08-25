import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
  type BacklinksHistoryItem,
  type BacklinksSummaryItem,
} from "@/server/lib/dataforseo";
import {
  normalizeBacklinksSpamFilterOptions,
  type BacklinksLookupInput,
  type BacklinksRowsPageInput,
  type BacklinksSpamFilterOptions,
  type ReferringDomainsPageInput,
  type TopPagesPageInput,
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
import {
  buildBacklinksScopeFilter,
  countExpressionConditions,
  prependScopeClauses,
} from "@/server/lib/dataforseo/researchScopeFilters";
import { buildSubfolderOverview } from "@/server/features/backlinks/services/backlinksSubfolderOverview";
import {
  buildPageResult,
  mapBacklinksRows,
  mapReferringDomainsRows,
  mapTopPagesRows,
  normalizeHistoryDate,
} from "@/server/features/backlinks/services/backlinksRowMappers";
import { assertFilterConditionBudget } from "@/server/lib/dataforseo/filters";
import { AppError } from "@/server/lib/errors";

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
): Promise<{ overview: BacklinksOverviewResult }> {
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

  if (normalizedTarget.scope === "subfolder") {
    const overview = await buildSubfolderOverview(
      dataforseo,
      normalizedTarget,
      now,
      creditFeature,
    );
    await cacheValue(
      cache,
      cacheKey,
      { overview },
      BACKLINKS_OVERVIEW_TTL_SECONDS,
    );
    return { overview };
  }

  const dateRange = buildBacklinksDateRange(now);

  const [summary, history] = await Promise.all([
    dataforseo.backlinks.summary({
      target: normalizedTarget.apiTarget,
      includeSubdomains: normalizedTarget.includeSubdomains,
      creditFeature,
    }),
    // history/live only accepts a hostname and has no include_subdomains field,
    // so trends are unavailable for a page and subdomain-inclusive otherwise.
    normalizedTarget.scope === "exact_url"
      ? Promise.resolve([])
      : dataforseo.backlinks.history({
          target: normalizedTarget.apiTarget,
          ...dateRange,
          creditFeature,
        }),
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

  const target = normalizeBacklinksTarget(input.target, { scope: input.scope });
  const scopeFilter = buildBacklinksScopeFilter("url_to", target);
  const userFilters = buildBacklinksRowsApiFilters(input.filters);
  // The scope group and the server-appended spam condition share the same
  // 8-condition budget as user filters.
  assertFilterConditionBudget(
    scopeFilter.conditionCount +
      countExpressionConditions(userFilters) +
      (normalizeBacklinksSpamFilterOptions(spamOptions).hideSpam ? 1 : 0),
  );
  const filters = prependScopeClauses(scopeFilter, userFilters);

  const response = await dataforseo.backlinks.rows({
    target: target.apiTarget,
    includeSubdomains: target.includeSubdomains,
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

  const target = normalizeBacklinksTarget(input.target, { scope: input.scope });
  // referring_domains has no URL field to filter on, so subfolder scope has no
  // accurate source for this breakdown (the count still comes from the
  // overview's filtered totals).
  if (target.scope === "subfolder") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Referring domains can't be broken down for a subfolder — use the Backlinks tab, or switch to Domain or Subdomains scope.",
    );
  }

  const response = await dataforseo.backlinks.referringDomains({
    target: target.apiTarget,
    includeSubdomains: target.includeSubdomains,
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

  const target = normalizeBacklinksTarget(input.target, { scope: input.scope });
  const scopeFilter = buildBacklinksScopeFilter("url", target);
  const userFilters = buildTopPagesApiFilters(input.filters);
  assertFilterConditionBudget(
    scopeFilter.conditionCount + countExpressionConditions(userFilters),
  );
  const filters = prependScopeClauses(scopeFilter, userFilters);

  const response = await dataforseo.backlinks.domainPages({
    target: target.apiTarget,
    includeSubdomains: target.includeSubdomains,
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
