import { z } from "zod";
import {
  type BacklinksApiResponse,
  type BacklinksRequest,
  fetchBacklinksRowsRaw,
  fetchBacklinksSummaryRaw,
  fetchDomainPagesSummaryRaw,
  fetchNewLostTimeseriesRaw,
  fetchReferringDomainsRaw,
  fetchTimeseriesSummaryRaw,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseoBacklinks";
import {
  backlinksOverviewSchema,
  referringDomainRowSchema,
  topPageRowSchema,
  type BacklinksOverviewResult,
} from "@/server/features/backlinks/services/backlinksOverviewSchema";
import {
  backlinksCostSummarySchema,
  summarizeBacklinksCosts,
  type BacklinksApiCallCost,
  type BacklinksCostSummary,
} from "@/server/features/backlinks/services/backlinksCost";
import type { BacklinksLookupInput } from "@/types/schemas/backlinks";

const BACKLINKS_OVERVIEW_TTL_SECONDS = 6 * 60 * 60;
const BACKLINKS_TAB_TTL_SECONDS = 6 * 60 * 60;

export type BacklinksCache = {
  get(key: string): Promise<unknown>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
};

type BacklinksOverviewProfile = {
  overview: BacklinksOverviewResult;
  billing: BacklinksCostSummary;
};

type ReferringDomainsProfile = {
  rows: BacklinksOverviewResult["referringDomains"];
  billing: BacklinksCostSummary;
};

type TopPagesProfile = {
  rows: BacklinksOverviewResult["topPages"];
  billing: BacklinksCostSummary;
};

const backlinksOverviewCacheSchema = z.object({
  overview: backlinksOverviewSchema,
  billing: backlinksCostSummarySchema,
});

const referringDomainsCacheSchema = z.object({
  rows: z.array(referringDomainRowSchema),
  billing: backlinksCostSummarySchema,
});

const topPagesCacheSchema = z.object({
  rows: z.array(topPageRowSchema),
  billing: backlinksCostSummarySchema,
});

type BacklinksDateRange = {
  dateFrom: string;
  dateTo: string;
};

export async function profileBacklinksOverview(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
): Promise<BacklinksOverviewProfile> {
  const cachedRaw = await cache.get(cacheKey);
  const cached = backlinksOverviewCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    return {
      overview: cached.data.overview,
      billing: withCacheFlag(cached.data.billing),
    };
  }

  const now = new Date();
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  const request = buildBacklinksRequest(input, normalizedTarget.apiTarget);
  const dateRange = buildBacklinksDateRange(now);

  const [summary, backlinks, trends, newLostTrends] = await Promise.all([
    fetchBacklinksSummaryRaw(request),
    fetchBacklinksRowsRaw({ ...request, limit: 100 }),
    normalizedTarget.scope === "domain"
      ? fetchTimeseriesSummaryRaw({ ...request, ...dateRange })
      : Promise.resolve(emptyResponse([])),
    normalizedTarget.scope === "domain"
      ? fetchNewLostTimeseriesRaw({ ...request, ...dateRange })
      : Promise.resolve(emptyResponse([])),
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
  const billing = summarizeBacklinksCosts(
    collectCostCalls([
      summary.billing,
      backlinks.billing,
      trends.billing,
      newLostTrends.billing,
    ]),
    false,
  );

  await cacheValue(
    cache,
    cacheKey,
    { overview, billing },
    BACKLINKS_OVERVIEW_TTL_SECONDS,
  );

  return { overview, billing };
}

export async function profileReferringDomainsRows(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
): Promise<ReferringDomainsProfile> {
  const cachedRaw = await cache.get(cacheKey);
  const cached = referringDomainsCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    return {
      rows: cached.data.rows,
      billing: withCacheFlag(cached.data.billing),
    };
  }

  const request = buildBacklinksRequest(
    input,
    normalizeBacklinksTarget(input.target, { scope: input.scope }).apiTarget,
  );
  const response = await fetchReferringDomainsRaw({ ...request, limit: 100 });
  const rows = mapReferringDomainsRows(response.data);
  const billing = summarizeBacklinksCosts([response.billing], false);

  await cacheValue(
    cache,
    cacheKey,
    { rows, billing },
    BACKLINKS_TAB_TTL_SECONDS,
  );

  return { rows, billing };
}

export async function profileTopPagesRows(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
): Promise<TopPagesProfile> {
  const cachedRaw = await cache.get(cacheKey);
  const cached = topPagesCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    return {
      rows: cached.data.rows,
      billing: withCacheFlag(cached.data.billing),
    };
  }

  const request = buildBacklinksRequest(
    input,
    normalizeBacklinksTarget(input.target, { scope: input.scope }).apiTarget,
  );
  const response = await fetchDomainPagesSummaryRaw({ ...request, limit: 100 });
  const rows = mapTopPagesRows(response.data);
  const billing = summarizeBacklinksCosts([response.billing], false);

  await cacheValue(
    cache,
    cacheKey,
    { rows, billing },
    BACKLINKS_TAB_TTL_SECONDS,
  );

  return { rows, billing };
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
  summary: Awaited<ReturnType<typeof fetchBacklinksSummaryRaw>>;
  backlinks: Awaited<ReturnType<typeof fetchBacklinksRowsRaw>>;
  trends: Awaited<ReturnType<typeof fetchTimeseriesSummaryRaw>>;
  newLostTrends: Awaited<ReturnType<typeof fetchNewLostTimeseriesRaw>>;
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
      rank: args.summary.data.rank ?? null,
      backlinks: args.summary.data.backlinks ?? null,
      referringPages: args.summary.data.referring_pages ?? null,
      referringDomains: args.summary.data.referring_domains ?? null,
      brokenBacklinks: args.summary.data.broken_backlinks ?? null,
      brokenPages: args.summary.data.broken_pages ?? null,
      backlinksSpamScore: args.summary.data.backlinks_spam_score ?? null,
      targetSpamScore: args.summary.data.info?.target_spam_score ?? null,
      newBacklinks: args.summary.data.new_backlinks ?? null,
      lostBacklinks: args.summary.data.lost_backlinks ?? null,
      newReferringDomains:
        args.summary.data.new_referring_domains ??
        args.summary.data.new_reffering_domains ??
        null,
      lostReferringDomains:
        args.summary.data.lost_referring_domains ??
        args.summary.data.lost_reffering_domains ??
        null,
    },
    backlinks: mapBacklinksRows(args.backlinks.data),
    referringDomains: [],
    topPages: [],
    trends: args.trends.data
      .filter((item) => Boolean(item.date))
      .map((item) => ({
        date: item.date ?? "",
        backlinks: item.backlinks ?? null,
        referringDomains: item.referring_domains ?? null,
        rank: item.rank ?? null,
      })),
    newLostTrends: args.newLostTrends.data
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

function collectCostCalls(calls: BacklinksApiCallCost[]) {
  return calls.filter((call) => call.costUsd > 0 || call.rowsReturned > 0);
}

function withCacheFlag(summary: BacklinksCostSummary): BacklinksCostSummary {
  return { ...summary, fromCache: true };
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

function emptyResponse<T>(data: T): BacklinksApiResponse<T> {
  return {
    data,
    billing: {
      endpoint: "",
      path: [],
      costUsd: 0,
      resultCount: null,
      rowsReturned: 0,
    },
  };
}
