import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  MINIMUM_SEO_DATA_BALANCE_USD,
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

  const { monthlyRemaining } = await assertSeoDataBalanceAvailable({
    customerId: billingCustomer.id,
    minimumBalanceUsd: MINIMUM_SEO_DATA_BALANCE_USD,
  });

  const result = await execute();

  await trackDataforseoCost({
    customerId: billingCustomer.id,
    billing: result.billing,
    monthlyRemaining,
  });

  return result.data;
}

async function assertSeoDataBalanceAvailable(args: {
  customerId: string;
  minimumBalanceUsd: number;
}) {
  const minimumCredits = Math.ceil(
    roundUsdForBilling(args.minimumBalanceUsd) *
      AUTUMN_SEO_DATA_CREDITS_PER_USD,
  );

  const [monthlyCheck, topupCheck] = await Promise.all([
    autumn.check({
      customerId: args.customerId,
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    }),
    autumn.check({
      customerId: args.customerId,
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    }),
  ]);

  const monthlyRemaining = monthlyCheck.balance?.remaining ?? 0;
  const topupRemaining = topupCheck.balance?.remaining ?? 0;

  if (monthlyRemaining + topupRemaining < minimumCredits) {
    throw new AppError("PAYMENT_REQUIRED");
  }

  return { monthlyRemaining };
}

async function trackDataforseoCost(args: {
  customerId: string;
  billing: DataforseoApiCallCost;
  monthlyRemaining: number;
}) {
  const totalCostUsd = roundUsdForBilling(args.billing.costUsd);
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
}

export type { LabsKeywordDataItem, SerpLiveItem };
