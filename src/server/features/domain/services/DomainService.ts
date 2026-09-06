import { waitUntil } from "cloudflare:workers";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { z } from "zod";
import { sortBy } from "remeda";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { buildRankedKeywordsScopeFilter } from "@/server/lib/dataforseo/researchScopeFilters";
import { joinClauses } from "@/server/lib/dataforseo/filters";
import { parseResearchTargetOrThrow } from "@/server/lib/domainUtils";
import type { ResearchScope } from "@/shared/researchScope";
import type {
  DomainHistoryResult,
  DomainHistorySeries,
} from "@/shared/domain-history";
import type { DomainHistoricalRankItem } from "@/server/lib/dataforseo";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { getPagesPage } from "@/server/features/domain/services/domainPagesPage";

// Lets a caller attribute spend to its own feature (e.g. onboarding). Applied
// to the DataForSEO call, not the cache key, so cached results are shared
// across callers.
type MeteringOverrides = {
  creditFeature?: CreditFeature;
};

/** Domain overview data is refreshed every 12 hours. */
const DOMAIN_OVERVIEW_TTL_SECONDS = 12 * 60 * 60;

const domainOverviewResultSchema = z.object({
  domain: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  hasData: z.boolean(),
  fetchedAt: z.string(),
});

const domainHistoryPointSchema = z.object({
  date: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
});

const domainHistorySeriesSchema = z.object({
  domain: z.string(),
  points: z.array(domainHistoryPointSchema),
  fetchedAt: z.string(),
});

type DomainOverviewResult = z.infer<typeof domainOverviewResultSchema> & {
  /** Requested research scope, echoed for display. */
  scope: ResearchScope;
  displayTarget: string;
};

async function getOverview(
  input: {
    projectId: string;
    domain: string;
    scope?: ResearchScope;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<DomainOverviewResult> {
  const target = parseResearchTargetOrThrow(input.domain, input.scope);
  const domain = target.hostname;

  // domain_rank_overview has no filters and always covers the hostname plus
  // all of its subdomains, so every scope shares one cache entry per hostname.
  // Callers label the metrics as domain-wide for narrower scopes.
  const cacheKey = await buildCacheKey("domain:overview", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainOverviewResultSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.hasData) {
    return {
      ...cached.data,
      scope: target.scope,
      displayTarget: target.display,
    };
  }

  const nowIso = new Date().toISOString();
  const dataforseo = createDataforseoClient(billingCustomer);

  const metricsResponse = await dataforseo.domain.rankOverview({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    ...metering,
  });

  const metrics = metricsResponse[0];

  const organicTraffic =
    metrics?.metrics?.organic?.etv != null
      ? Math.round(metrics.metrics.organic.etv)
      : null;
  const organicKeywords =
    metrics?.metrics?.organic?.count != null
      ? Math.round(metrics.metrics.organic.count)
      : null;

  const stored: z.infer<typeof domainOverviewResultSchema> = {
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: null,
    referringDomains: null,
    hasData: organicKeywords != null && organicKeywords > 0,
    fetchedAt: nowIso,
  };

  if (stored.hasData) {
    // waitUntil, not void: workerd cancels unregistered pending I/O once the
    // response is sent, so a fire-and-forget put never persists the cache.
    waitUntil(
      setCached(cacheKey, stored, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
        (error) => {
          console.error("domain.overview.cache-write failed:", error);
        },
      ),
    );
  }

  return { ...stored, scope: target.scope, displayTarget: target.display };
}

async function getHistoricalOverview(
  input: {
    projectId: string;
    domains: string[];
    dateFrom: string;
    dateTo: string;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<DomainHistoryResult> {
  const series = await Promise.all(
    input.domains.map((domain) =>
      getHistoricalSeries(
        {
          ...input,
          domain,
        },
        billingCustomer,
      ),
    ),
  );

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    series,
  };
}

async function getHistoricalSeries(
  input: {
    projectId: string;
    domain: string;
    dateFrom: string;
    dateTo: string;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<DomainHistorySeries> {
  const target = parseResearchTargetOrThrow(input.domain, "subdomains");
  const domain = target.hostname;
  const cacheKey = await buildCacheKey("domain:historical-overview", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = domainHistorySeriesSchema.safeParse(await getCached(cacheKey));
  if (cached.success) return cached.data;

  const dataforseo = createDataforseoClient(billingCustomer);
  const items: DomainHistoricalRankItem[] =
    await dataforseo.domain.historicalRankOverview({
      target: domain,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

  const stored: DomainHistorySeries = {
    domain,
    fetchedAt: new Date().toISOString(),
    points: sortBy(
      items.flatMap((item) => {
        const year = item.year;
        const month = item.month;
        if (
          year == null ||
          month == null ||
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          month < 1 ||
          month > 12
        ) {
          return [];
        }
        const organic = item.metrics?.organic;
        return [
          {
            date: `${year}-${String(month).padStart(2, "0")}-01`,
            organicTraffic:
              organic?.etv == null ? null : Math.round(organic.etv),
            organicKeywords:
              organic?.count == null ? null : Math.round(organic.count),
          },
        ];
      }),
      (point) => point.date,
    ),
  };

  waitUntil(
    setCached(cacheKey, stored, DOMAIN_OVERVIEW_TTL_SECONDS).catch((error) => {
      console.error("domain.historical-overview.cache-write failed:", error);
    }),
  );
  return stored;
}

async function getSuggestedKeywords(
  input: {
    domain: string;
    scope?: ResearchScope;
    locationCode: number;
    languageCode: string;
    organizationId: string;
    projectId: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<
  Array<{
    keyword: string;
    position: number | null;
    searchVolume: number | null;
    traffic: number | null;
    cpc: number | null;
    keywordDifficulty: number | null;
  }>
> {
  const target = parseResearchTargetOrThrow(input.domain, input.scope);
  const scopeFilter = buildRankedKeywordsScopeFilter(target);

  const cacheKey = await buildCacheKey("domain:keyword-suggestions", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain: target.hostname,
    scope: target.scope,
    path: target.path,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = z
    .array(
      z.object({
        keyword: z.string(),
        position: z.number().nullable(),
        searchVolume: z.number().nullable(),
        traffic: z.number().nullable(),
        cpc: z.number().nullable(),
        keywordDifficulty: z.number().nullable(),
      }),
    )
    .safeParse(cachedRaw);
  if (cached.success && cached.data.length > 0) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const rankedKeywordsResponse = await dataforseo.domain.rankedKeywords({
    target: target.hostname,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: 100,
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
    filters:
      scopeFilter.clauses.length > 0
        ? joinClauses(scopeFilter.clauses, "and")
        : undefined,
    ...metering,
  });

  const keywords = rankedKeywordsResponse.items
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    )
    .map((item) => ({
      keyword: item.keyword,
      position: item.position,
      searchVolume: item.searchVolume,
      traffic: item.traffic,
      cpc: item.cpc,
      keywordDifficulty: item.keywordDifficulty,
    }));

  if (keywords.length > 0) {
    waitUntil(
      setCached(cacheKey, keywords, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
        (error) => {
          console.error(
            "domain.keyword-suggestions.cache-write failed:",
            error,
          );
        },
      ),
    );
  }

  return keywords;
}

export const DomainService = {
  getOverview,
  getHistoricalOverview,
  getSuggestedKeywords,
  getKeywordsPage,
  getPagesPage,
} as const;
