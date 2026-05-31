/* eslint-disable max-lines, max-lines-per-function */
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  SEO_DATA_COST_MARKUP,
  roundUsdForBilling,
} from "@/shared/billing";
import {
  type CreditFeature,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import { autumn } from "@/server/billing/autumn";
import { getOrCreateOrganizationCustomer } from "@/server/billing/subscription";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  fetchKeywordIdeasRaw,
  fetchKeywordOverviewRaw,
  fetchKeywordSuggestionsRaw,
  fetchRelatedKeywordsRaw,
  fetchBusinessListingsSearchRaw,
  fetchBusinessQuestionsAnswersRaw,
  fetchDomainRankOverviewRaw,
  fetchKeywordSearchVolumeRaw,
  fetchLocalSerpItemsRaw,
  fetchRankedKeywordsRaw,
  fetchRelevantPagesRaw,
  fetchSerpCompetitorsRaw,
  type DataforseoLabsItemType,
  fetchLiveSerpItemsRaw,
  fetchRankCheckSerpRaw,
  type LabsKeywordDataItem,
  type SerpLiveItem,
} from "@/server/lib/dataforseo";
import {
  fetchLlmAggregatedMetricsRaw,
  fetchLlmMentionsSearchRaw,
  fetchLlmResponseRaw,
  fetchLlmTopPagesRaw,
  type LlmAggregatedMetricsInput,
  type LlmMentionsSearchInput,
  type LlmResponsesInput,
  type LlmTopPagesInput,
} from "@/server/lib/dataforseoLlm";
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
  DataforseoChargedTaskError,
} from "@/server/lib/dataforseoCost";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

export { mapDataforseoPathToCreditFeature };

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    business: {
      businessListings(input: {
        categories?: string[];
        title?: string;
        locationCoordinate: string;
        orderBy?: string[];
        limit: number;
      }) {
        return meterDataforseoCall(
          customer,
          () => fetchBusinessListingsSearchRaw(input),
          "local_seo",
        );
      },
      questionsAnswers(input: {
        keyword: string;
        locationCoordinate: string;
        languageCode: string;
        depth: number;
      }) {
        return meterDataforseoCall(
          customer,
          () => fetchBusinessQuestionsAnswersRaw(input),
          "local_seo",
        );
      },
    },
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
        offset?: number;
        orderBy?: string[];
        filters?: unknown[];
        itemTypes?: DataforseoLabsItemType[];
        includeSubdomains?: boolean;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchRankedKeywordsRaw(input),
        );
      },
      relevantPages(input: {
        target: string;
        locationCode: number;
        languageCode: string;
        limit: number;
        offset?: number;
        orderBy?: string[];
        filters?: unknown[];
      }) {
        return meterDataforseoCall(customer, () =>
          fetchRelevantPagesRaw(input),
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
        depth: number;
      }) {
        return meterDataforseoCall(
          customer,
          () => fetchRankCheckSerpRaw(input),
          "rank_tracking",
        );
      },
      local(input: {
        keyword: string;
        locationCoordinate?: string;
        languageCode: string;
        searchType: "maps" | "local_finder";
        device: "desktop" | "mobile";
        depth: number;
        searchPlaces?: boolean;
      }) {
        return meterDataforseoCall(
          customer,
          () => fetchLocalSerpItemsRaw(input),
          "local_seo",
        );
      },
    },
    keywordData: {
      searchVolume(input: {
        keywords: string[];
        locationCode?: number;
        languageCode?: string;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchKeywordSearchVolumeRaw(input),
        );
      },
    },
    labs: {
      keywordOverview(input: {
        keywords: string[];
        locationCode: number;
        languageCode: string;
      }) {
        return meterDataforseoCall(
          customer,
          () =>
            fetchKeywordOverviewRaw(
              input.keywords,
              input.locationCode,
              input.languageCode,
            ),
          "rank_tracking",
        );
      },
      serpCompetitors(input: {
        keywords: string[];
        locationCode: number;
        languageCode: string;
        itemTypes?: DataforseoLabsItemType[];
        includeSubdomains?: boolean;
        limit: number;
        offset?: number;
      }) {
        return meterDataforseoCall(customer, () =>
          fetchSerpCompetitorsRaw(input),
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
    aiSearch: {
      mentionsSearch(input: LlmMentionsSearchInput) {
        return meterDataforseoCall(customer, () =>
          fetchLlmMentionsSearchRaw(input),
        );
      },
      aggregatedMetrics(input: LlmAggregatedMetricsInput) {
        return meterDataforseoCall(customer, () =>
          fetchLlmAggregatedMetricsRaw(input),
        );
      },
      topPages(input: LlmTopPagesInput) {
        return meterDataforseoCall(customer, () => fetchLlmTopPagesRaw(input));
      },
      llmResponse(input: LlmResponsesInput) {
        return meterDataforseoCall(customer, () => fetchLlmResponseRaw(input));
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

  let result: DataforseoApiResponse<T>;
  try {
    result = await execute();
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError) {
      await trackDataforseoCost({
        customer,
        customerId: billingCustomer.id,
        billing: error.billing,
        monthlyRemaining,
        creditFeature,
      });
    }
    throw error;
  }

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

  const creditFeature =
    args.creditFeature ?? mapDataforseoPathToCreditFeature(args.billing.path);

  const properties = {
    provider: "dataforseo",
    currency: "USD",
    paths: [args.billing.path.join("/")],
    creditFeature,
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
        credit_feature: creditFeature,
        monthly_credits: monthlyDeduct,
        topup_credits: topupDeduct,
        total_credits: totalCostCredits,
        cost_usd: totalCostUsd,
      },
    });
  }
}

export type { LabsKeywordDataItem, SerpLiveItem };
