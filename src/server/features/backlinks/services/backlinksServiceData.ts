import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  type BacklinksRequest,
  type fetchBacklinksRowsRaw,
  type fetchBacklinksSummaryRaw,
  type fetchDomainPagesSummaryRaw,
  type fetchNewLostTimeseriesRaw,
  type fetchReferringDomainsRaw,
  type fetchTimeseriesSummaryRaw,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseoBacklinks";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import {
  backlinksOverviewSchema,
  referringDomainRowSchema,
  topPageRowSchema,
  type BacklinksOverviewResult,
} from "@/server/features/backlinks/services/backlinksOverviewSchema";
import type { BacklinksLookupInput } from "@/types/schemas/backlinks";

const BACKLINKS_OVERVIEW_TTL_SECONDS = 6 * 60 * 60;
const BACKLINKS_TAB_TTL_SECONDS = 6 * 60 * 60;

export type BacklinksCache = {
  get(key: string): Promise<unknown>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
};

type BacklinksOverviewProfile = {
  overview: BacklinksOverviewResult;
};

type ReferringDomainsProfile = {
  rows: BacklinksOverviewResult["referringDomains"];
};

type TopPagesProfile = {
  rows: BacklinksOverviewResult["topPages"];
};

const backlinksOverviewCacheSchema = z.object({
  overview: backlinksOverviewSchema,
});

const referringDomainsCacheSchema = z.object({
  rows: z.array(referringDomainRowSchema),
});

const topPagesCacheSchema = z.object({ rows: z.array(topPageRowSchema) });

type BacklinksDateRange = {
  dateFrom: string;
  dateTo: string;
};

export async function profileBacklinksOverview(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<BacklinksOverviewProfile> {
  const cachedRaw = await cache.get(cacheKey);
  const cached = backlinksOverviewCacheSchema.safeParse(cachedRaw);
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
  const request = buildBacklinksRequest(input, normalizedTarget.apiTarget);
  const dateRange = buildBacklinksDateRange(now);

  const [summary, backlinks, trends, newLostTrends] = await Promise.all([
    dataforseo.backlinks.summary(request),
    dataforseo.backlinks.rows({ ...request, limit: 100 }),
    normalizedTarget.scope === "domain"
      ? dataforseo.backlinks.timeseriesSummary({ ...request, ...dateRange })
      : Promise.resolve([]),
    normalizedTarget.scope === "domain"
      ? dataforseo.backlinks.newLostTimeseries({ ...request, ...dateRange })
      : Promise.resolve([]),
  ]);

  const overview = buildOverviewResult({
    input,
    normalizedTarget,
    now,
    summary,
    backlinks,
    trends,
    newLostTrends,
  });
  await cacheValue(
    cache,
    cacheKey,
    { overview },
    BACKLINKS_OVERVIEW_TTL_SECONDS,
  );

  return { overview };
}

export async function profileReferringDomainsRows(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<ReferringDomainsProfile> {
  const cachedRaw = await cache.get(cacheKey);
  const cached = referringDomainsCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    return {
      rows: cached.data.rows,
    };
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const request = buildBacklinksRequest(
    input,
    normalizeBacklinksTarget(input.target, { scope: input.scope }).apiTarget,
  );
  const response = await dataforseo.backlinks.referringDomains({
    ...request,
    limit: 100,
  });
  const rows = mapReferringDomainsRows(response);

  await cacheValue(cache, cacheKey, { rows }, BACKLINKS_TAB_TTL_SECONDS);

  return { rows };
}

export async function profileTopPagesRows(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<TopPagesProfile> {
  const cachedRaw = await cache.get(cacheKey);
  const cached = topPagesCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    return {
      rows: cached.data.rows,
    };
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const request = buildBacklinksRequest(
    input,
    normalizeBacklinksTarget(input.target, { scope: input.scope }).apiTarget,
  );
  const response = await dataforseo.backlinks.domainPages({
    ...request,
    limit: 100,
  });
  const rows = mapTopPagesRows(response);

  await cacheValue(cache, cacheKey, { rows }, BACKLINKS_TAB_TTL_SECONDS);

  return { rows };
}

function buildBacklinksRequest(
  input: BacklinksLookupInput,
  target: string,
): BacklinksRequest {
  return {
    target,
    includeSubdomains: input.includeSubdomains,
    includeIndirectLinks: input.includeIndirectLinks,
    excludeInternalBacklinks: input.excludeInternalBacklinks,
    status: input.status,
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
  input: BacklinksLookupInput;
  normalizedTarget: ReturnType<typeof normalizeBacklinksTarget>;
  now: Date;
  summary: Awaited<ReturnType<typeof fetchBacklinksSummaryRaw>>["data"];
  backlinks: Awaited<ReturnType<typeof fetchBacklinksRowsRaw>>["data"];
  trends: Awaited<ReturnType<typeof fetchTimeseriesSummaryRaw>>["data"];
  newLostTrends: Awaited<ReturnType<typeof fetchNewLostTimeseriesRaw>>["data"];
}): BacklinksOverviewResult {
  return {
    target: args.normalizedTarget.apiTarget,
    displayTarget: args.normalizedTarget.displayTarget,
    scope: args.normalizedTarget.scope,
    includeSubdomains: args.input.includeSubdomains,
    includeIndirectLinks: args.input.includeIndirectLinks,
    excludeInternalBacklinks: args.input.excludeInternalBacklinks,
    status: args.input.status,
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
    backlinks: mapBacklinksRows(args.backlinks),
    referringDomains: [],
    topPages: [],
    trends: args.trends
      .filter((item) => Boolean(item.date))
      .map((item) => ({
        date: item.date ?? "",
        backlinks: item.backlinks ?? null,
        referringDomains: item.referring_domains ?? null,
        rank: item.rank ?? null,
      })),
    newLostTrends: args.newLostTrends
      .filter((item) => Boolean(item.date))
      .map((item) => ({
        date: item.date ?? "",
        newBacklinks: item.new_backlinks ?? null,
        lostBacklinks: item.lost_backlinks ?? null,
        newReferringDomains:
          item.new_referring_domains ?? item.new_reffering_domains ?? null,
        lostReferringDomains:
          item.lost_referring_domains ?? item.lost_reffering_domains ?? null,
      })),
    fetchedAt: args.now.toISOString(),
  };
}

function mapBacklinksRows(
  rows: Awaited<ReturnType<typeof fetchBacklinksRowsRaw>>["data"],
) {
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

function mapReferringDomainsRows(
  rows: Awaited<ReturnType<typeof fetchReferringDomainsRaw>>["data"],
) {
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

function mapTopPagesRows(
  rows: Awaited<ReturnType<typeof fetchDomainPagesSummaryRaw>>["data"],
) {
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
