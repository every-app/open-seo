import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  SEO_DATA_COST_MARKUP,
  roundUsdForBilling,
} from "@/shared/billing";
import { autumn } from "@/server/billing/autumn";
import { getOrCreateOrganizationCustomer } from "@/server/billing/subscription";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  fetchKeywordIdeasRaw,
  fetchKeywordSuggestionsRaw,
  fetchRelatedKeywordsRaw,
  fetchDomainRankOverviewRaw,
  fetchRankedKeywordsRaw,
  fetchLiveSerpItemsRaw,
  fetchRankCheckSerpRaw,
  type LabsKeywordDataItem,
  type SerpLiveItem,
} from "@/server/lib/dataforseo";
import { fetchDataforseoLighthouseResultRaw } from "@/server/lib/dataforseoLighthouse";
import type { LighthouseStrategy } from "@/server/lib/dataforseoLighthousePayload";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";
import {
  fetchBacklinksHistoryRaw,
  fetchBacklinksRowsRaw,
  fetchBacklinksSummaryRaw,
  fetchDomainPagesSummaryRaw,
  fetchReferringDomainsRaw,
  type BacklinksListRequest,
  type BacklinksRequest,
  type BacklinksTimeseriesRequest,
} from "@/server/lib/dataforseoBacklinks";
import {
  type DataforseoApiResponse,
  type DataforseoApiCallCost,
} from "@/server/lib/dataforseoCost";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

type CreditFeature =
  | "keyword_research"
  | "domain_overview"
  | "backlinks"
  | "site_audit"
  | "rank_tracking";

/**
 * Maps a DataForSEO API response path (e.g. ["v3", "dataforseo_labs", "google", "related_keywords", "live"])
 * to a product feature for analytics. path[1] is the API module; for dataforseo_labs,
 * path[3] distinguishes keyword vs domain endpoints.
 */
export function mapDataforseoPathToCreditFeature(
  path: string[],
): CreditFeature {
  const module = path[1];

  switch (module) {
    case "on_page":
      return "site_audit";
    case "backlinks":
      return "backlinks";
    case "serp":
      return "keyword_research";
    case "dataforseo_labs": {
      const endpoint = path[3] ?? "";
      if (endpoint.startsWith("domain_") || endpoint === "ranked_keywords") {
        return "domain_overview";
      }
      return "keyword_research";
    }
    default:
      return "site_audit";
  }
}

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    backlinks: {
      summary(input: BacklinksRequest) {
        return meterDataforseoCall(customer, () =>
          fetchBacklinksSummaryRaw(input),
        );
      },
      rows(input: BacklinksListRequest) {
        return meterDataforseoCall(customer, () =>
          fetchBacklinksRowsRaw(input),
        );
      },
      referringDomains(input: BacklinksListRequest) {
        return meterDataforseoCall(customer, () =>
          fetchReferringDomainsRaw(input),
        );
      },
      domainPages(input: BacklinksListRequest) {
        return meterDataforseoCall(customer, () =>
          fetchDomainPagesSummaryRaw(input),
        );
      },
      history(input: BacklinksTimeseriesRequest) {
        return meterDataforseoCall(customer, () =>
          fetchBacklinksHistoryRaw(input),
        );
      },
    },
    keywords: {
      related(input: {
        keyword: string;
        locationCode: number;
        languageCode: string;
        limit: number;
        depth?: number;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchRelatedKeywordsRaw(
            input.keyword,
            input.locationCode,
            input.languageCode,
            input.limit,
            input.depth,
          ),
        );
      },
      suggestions(input: {
        keyword: string;
        locationCode: number;
        languageCode: string;
        limit: number;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchKeywordSuggestionsRaw(
            input.keyword,
            input.locationCode,
            input.languageCode,
            input.limit,
          ),
        );
      },
      ideas(input: {
        keyword: string;
        locationCode: number;
        languageCode: string;
        limit: number;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchKeywordIdeasRaw(
            input.keyword,
            input.locationCode,
            input.languageCode,
            input.limit,
          ),
        );
      },
    },
    domain: {
      rankOverview(input: {
        target: string;
        locationCode: number;
        languageCode: string;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchDomainRankOverviewRaw(
            input.target,
            input.locationCode,
            input.languageCode,
          ),
        );
      },
      rankedKeywords(input: {
        target: string;
        locationCode: number;
        languageCode: string;
        limit: number;
        orderBy?: string[];
      }) {
        return meterDataforseoCall(customer, () =>
          fetchRankedKeywordsRaw(
            input.target,
            input.locationCode,
            input.languageCode,
            input.limit,
            input.orderBy,
          ),
        );
      },
    },
    serp: {
      live(input: {
        keyword: string;
        locationCode: number;
        languageCode: string;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchLiveSerpItemsRaw(
            input.keyword,
            input.locationCode,
            input.languageCode,
          ),
        );
      },
      rankCheck(input: {
        keyword: string;
        keywordId: string;
        locationCode: number;
        languageCode: string;
        device: "desktop" | "mobile";
        targetDomain: string;
      }) {
        return meterDataforseoCall(
          customer,
          () => fetchRankCheckSerpRaw(input),
          "rank_tracking",
        );
      },
    },
    lighthouse: {
      live(input: { url: string; strategy: LighthouseStrategy }) {
        return meterDataforseoCall<StoredLighthousePayload>(customer, () =>
          fetchDataforseoLighthouseResultRaw(input),
        );
      },
    },
  } as const;
}

async function meterDataforseoCall<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  creditFeature?: CreditFeature,
): Promise<T> {
  const isHostedMode = await isHostedServerAuthMode();

  if (!isHostedMode) {
    const result = await execute();
    return result.data;
  }

  const billingCustomer = await getOrCreateOrganizationCustomer(customer);

  const { monthlyRemaining } = await assertSeoDataBalanceAvailable(
    billingCustomer.id,
  );

  const result = await execute();

  await trackDataforseoCost({
    customer,
    customerId: billingCustomer.id,
    billing: result.billing,
    monthlyRemaining,
    creditFeature,
  });

  return result.data;
}

async function assertSeoDataBalanceAvailable(customerId: string) {
  const [monthlyCheck, topupCheck] = await Promise.all([
    autumn.check({
      customerId,
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    }),
    autumn.check({
      customerId,
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    }),
  ]);

  const monthlyRemaining = monthlyCheck.balance?.remaining ?? 0;
  const topupRemaining = topupCheck.balance?.remaining ?? 0;

  if (monthlyRemaining + topupRemaining <= 0) {
    throw new AppError("INSUFFICIENT_CREDITS");
  }

  return { monthlyRemaining };
}

async function trackDataforseoCost(args: {
  customer: BillingCustomerContext;
  customerId: string;
  billing: DataforseoApiCallCost;
  monthlyRemaining: number;
  creditFeature?: CreditFeature;
}) {
  const totalCostUsd = roundUsdForBilling(
    args.billing.costUsd * SEO_DATA_COST_MARKUP,
  );
  const totalCostCredits = Math.ceil(
    totalCostUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD,
  );

  const monthlyDeduct = Math.min(args.monthlyRemaining, totalCostCredits);
  const topupDeduct = totalCostCredits - monthlyDeduct;

  const properties = {
    provider: "dataforseo",
    currency: "USD",
    paths: [args.billing.path.join("/")],
    totalCostUsd,
    totalCostCredits,
    fromCache: false,
  };

  if (monthlyDeduct > 0) {
    await autumn.track({
      customerId: args.customerId,
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      value: monthlyDeduct,
      properties: {
        ...properties,
        balanceFeatureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      },
    });
  }

  if (topupDeduct > 0) {
    await autumn.track({
      customerId: args.customerId,
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      value: topupDeduct,
      properties: {
        ...properties,
        balanceFeatureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      },
    });
  }

  if (totalCostCredits > 0) {
    await captureServerEvent({
      distinctId: args.customer.userId,
      event: "usage:credits_consume",
      organizationId: args.customer.organizationId,
      properties: {
        project_id: args.customer.projectId,
        credit_feature:
          args.creditFeature ??
          mapDataforseoPathToCreditFeature(args.billing.path),
        monthly_credits: monthlyDeduct,
        topup_credits: topupDeduct,
        total_credits: totalCostCredits,
        cost_usd: totalCostUsd,
      },
    });
  }
}

export type { LabsKeywordDataItem, SerpLiveItem };
