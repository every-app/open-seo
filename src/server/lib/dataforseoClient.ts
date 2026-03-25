import { MINIMUM_SEO_DATA_BALANCE_USD } from "@/shared/billing";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_USAGE_FEATURE_ID,
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
  type LabsKeywordDataItem,
  type SerpLiveItem,
} from "@/server/lib/dataforseo";
import { fetchDataforseoLighthouseResultRaw } from "@/server/lib/dataforseoLighthouse";
import type { LighthouseStrategy } from "@/server/lib/dataforseoLighthousePayload";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";
import {
  fetchBacklinksRowsRaw,
  fetchBacklinksSummaryRaw,
  fetchDomainPagesSummaryRaw,
  fetchNewLostTimeseriesRaw,
  fetchReferringDomainsRaw,
  fetchTimeseriesSummaryRaw,
  type BacklinksListRequest,
  type BacklinksRequest,
  type BacklinksTimeseriesRequest,
} from "@/server/lib/dataforseoBacklinks";
import {
  type DataforseoApiResponse,
  type DataforseoApiCallCost,
} from "@/server/lib/dataforseoCost";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

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
      timeseriesSummary(input: BacklinksTimeseriesRequest) {
        return meterDataforseoCall(customer, () =>
          fetchTimeseriesSummaryRaw(input),
        );
      },
      newLostTimeseries(input: BacklinksTimeseriesRequest) {
        return meterDataforseoCall(customer, () =>
          fetchNewLostTimeseriesRaw(input),
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
): Promise<T> {
  const isHostedMode = await isHostedServerAuthMode();

  if (!isHostedMode) {
    const result = await execute();
    return result.data;
  }

  const billingCustomer = await getOrCreateOrganizationCustomer(customer);

  await assertSeoDataBalanceAvailable({
    customerId: billingCustomer.id,
    minimumBalanceUsd: MINIMUM_SEO_DATA_BALANCE_USD,
  });

  const result = await execute();

  await trackDataforseoCost({
    customerId: billingCustomer.id,
    billing: result.billing,
  });

  return result.data;
}

async function assertSeoDataBalanceAvailable(args: {
  customerId: string;
  minimumBalanceUsd: number;
}) {
  const result = await autumn.check({
    customerId: args.customerId,
    featureId: AUTUMN_SEO_DATA_USAGE_FEATURE_ID,
    requiredBalance: Math.ceil(
      roundUsdForBilling(args.minimumBalanceUsd) *
        AUTUMN_SEO_DATA_CREDITS_PER_USD,
    ),
  });

  if (!result.allowed) {
    throw new AppError("PAYMENT_REQUIRED");
  }
}

async function trackDataforseoCost(args: {
  customerId: string;
  billing: DataforseoApiCallCost;
}) {
  const totalCostUsd = roundUsdForBilling(args.billing.costUsd);
  const totalCostCredits = Math.ceil(
    totalCostUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD,
  );

  await autumn.track({
    customerId: args.customerId,
    featureId: AUTUMN_SEO_DATA_USAGE_FEATURE_ID,
    value: totalCostCredits,
    properties: {
      provider: "dataforseo",
      currency: "USD",
      balanceFeatureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      paths: [args.billing.path.join("/")],
      totalCostUsd,
      totalCostCredits,
      fromCache: false,
    },
  });
}

export type { LabsKeywordDataItem, SerpLiveItem };
