import { waitUntil } from "cloudflare:workers";
import {
  buildCacheKey,
  deleteCached,
  getCached,
  setCached,
} from "@/server/lib/r2-cache";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import {
  getKeywordsPage,
  clearKeywordsPageCache,
} from "@/server/features/domain/services/domainKeywordsPage";
import {
  getPagesPage,
  clearPagesPageCache,
} from "@/server/features/domain/services/domainPagesPage";
import {
  getGlobalTopMarkets,
  isGlobalLocationCode,
} from "@/shared/domain-global-market";

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

type DomainOverviewResult = z.infer<typeof domainOverviewResultSchema>;

type MarketMetrics = {
  organicTraffic: number | null;
  organicKeywords: number | null;
};

/** Fetches raw organic traffic/keyword-count metrics for one location. */
async function fetchMarketMetrics(
  dataforseo: ReturnType<typeof createDataforseoClient>,
  domain: string,
  locationCode: number,
  languageCode: string,
  metering: MeteringOverrides,
): Promise<MarketMetrics> {
  const metricsResponse = await dataforseo.domain.rankOverview({
    target: domain,
    locationCode,
    languageCode,
    ...metering,
  });
  const metrics = metricsResponse[0];
  return {
    organicTraffic:
      metrics?.metrics?.organic?.etv != null
        ? Math.round(metrics.metrics.organic.etv)
        : null,
    organicKeywords:
      metrics?.metrics?.organic?.count != null
        ? Math.round(metrics.metrics.organic.count)
        : null,
  };
}

/**
 * Global has no single DataForSEO endpoint: sums per-market metrics across
 * GLOBAL_TOP_MARKET_CODES as a fixed-cost approximation of "worldwide" (see
 * shared/domain-global-market.ts). Markets with no data are excluded from
 * the sum rather than treated as zero, so a domain that only ranks in a
 * couple of the top markets isn't reported as smaller than it is.
 */
async function fetchGlobalMetrics(
  dataforseo: ReturnType<typeof createDataforseoClient>,
  domain: string,
  metering: MeteringOverrides,
): Promise<MarketMetrics> {
  const perMarket = await Promise.all(
    getGlobalTopMarkets().map((market) =>
      fetchMarketMetrics(
        dataforseo,
        domain,
        market.locationCode,
        market.languageCode,
        metering,
      ),
    ),
  );
  const withData = perMarket.filter(
    (m) => m.organicTraffic != null || m.organicKeywords != null,
  );
  if (withData.length === 0) {
    return { organicTraffic: null, organicKeywords: null };
  }
  return {
    organicTraffic: withData.reduce(
      (sum, m) => sum + (m.organicTraffic ?? 0),
      0,
    ),
    organicKeywords: withData.reduce(
      (sum, m) => sum + (m.organicKeywords ?? 0),
      0,
    ),
  };
}

async function getOverview(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<DomainOverviewResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);

  const cacheKey = await buildCacheKey("domain:overview", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainOverviewResultSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.hasData) {
    return cached.data;
  }

  const nowIso = new Date().toISOString();
  const dataforseo = createDataforseoClient(billingCustomer);

  const { organicTraffic, organicKeywords } = isGlobalLocationCode(
    input.locationCode,
  )
    ? await fetchGlobalMetrics(dataforseo, domain, metering)
    : await fetchMarketMetrics(
        dataforseo,
        domain,
        input.locationCode,
        input.languageCode,
        metering,
      );

  const result: DomainOverviewResult = {
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: null,
    referringDomains: null,
    hasData: organicKeywords != null && organicKeywords > 0,
    fetchedAt: nowIso,
  };

  if (result.hasData) {
    // waitUntil, not void: workerd cancels unregistered pending I/O once the
    // response is sent, so a fire-and-forget put never persists the cache.
    waitUntil(
      setCached(cacheKey, result, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
        (error) => {
          console.error("domain.overview.cache-write failed:", error);
        },
      ),
    );
  }

  return result;
}

/** Deletes the cached overview entry (mirrors getOverview's cache key exactly) so the next lookup is a fresh DataForSEO fetch. */
async function clearOverviewCache(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<void> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const cacheKey = await buildCacheKey("domain:overview", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });
  await deleteCached(cacheKey);
}

async function getSuggestedKeywords(
  input: {
    domain: string;
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
  const domain = normalizeDomainInput(input.domain, true);

  const cacheKey = await buildCacheKey("domain:keyword-suggestions", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
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
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: 100,
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
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
  getSuggestedKeywords,
  getKeywordsPage,
  getPagesPage,
  clearOverviewCache,
  clearKeywordsPageCache,
  clearPagesPageCache,
} as const;
