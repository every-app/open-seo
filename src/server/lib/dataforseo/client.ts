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
  fetchBusinessListingsSearch,
  fetchQuestionsAnswers,
} from "@/server/lib/dataforseo/business";
import {
  fetchBacklinksHistory,
  fetchBacklinksRows,
  fetchBacklinksSummary,
  fetchDomainPagesSummary,
  fetchReferringDomains,
} from "@/server/lib/dataforseo/backlinks";
import {
  fetchDomainRankOverview,
  fetchKeywordIdeas,
  fetchKeywordOverview,
  fetchKeywordSuggestions,
  fetchRankedKeywords,
  fetchRelatedKeywords,
  fetchRelevantPages,
  fetchSerpCompetitors,
} from "@/server/lib/dataforseo/labs";
import {
  fetchLiveSerp,
  fetchLocalSerp,
  fetchRankCheckSerp,
} from "@/server/lib/dataforseo/serp";
import { fetchLighthouseResult } from "@/server/lib/dataforseo/lighthouse";
import {
  fetchLlmAggregatedMetrics,
  fetchLlmMentionsSearch,
  fetchLlmResponse,
  fetchLlmTopPages,
} from "@/server/lib/dataforseo/ai";
import {
  DataforseoChargedTaskError,
  type DataforseoApiCallCost,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

export { mapDataforseoPathToCreditFeature };

/**
 * Wraps a section fetcher with billing metering. Each entry on the client is
 * `meter(customer, fetcher, defaultFeature?)`, which returns a function with the
 * fetcher's own input type and resolves to its unwrapped `.data`.
 *
 * `defaultFeature` is the fallback credit feature; a caller can override it per
 * call by passing `creditFeature` in the input (e.g. an MCP tool attributing
 * spend to its own feature). The extra field is ignored by the fetchers, which
 * read named fields rather than spreading the input.
 */
function meter<I, T>(
  customer: BillingCustomerContext,
  fetcher: (input: I) => Promise<DataforseoApiResponse<T>>,
  defaultFeature?: CreditFeature,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      () => fetcher(input),
      input.creditFeature ?? defaultFeature,
    );
}

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    business: {
      businessListings: meter(
        customer,
        fetchBusinessListingsSearch,
        "local_seo",
      ),
      questionsAnswers: meter(customer, fetchQuestionsAnswers, "local_seo"),
    },
    backlinks: {
      summary: meter(customer, fetchBacklinksSummary),
      rows: meter(customer, fetchBacklinksRows),
      referringDomains: meter(customer, fetchReferringDomains),
      domainPages: meter(customer, fetchDomainPagesSummary),
      history: meter(customer, fetchBacklinksHistory),
    },
    keywords: {
      related: meter(customer, fetchRelatedKeywords),
      suggestions: meter(customer, fetchKeywordSuggestions),
      ideas: meter(customer, fetchKeywordIdeas),
    },
    domain: {
      rankOverview: meter(customer, fetchDomainRankOverview),
      rankedKeywords: meter(customer, fetchRankedKeywords),
      relevantPages: meter(customer, fetchRelevantPages),
    },
    serp: {
      live: meter(customer, fetchLiveSerp),
      rankCheck: meter(customer, fetchRankCheckSerp, "rank_tracking"),
      local: meter(customer, fetchLocalSerp, "local_seo"),
    },
    labs: {
      // Callers (e.g. the keyword-metrics MCP tool) can attribute the spend to
      // their own feature by passing `creditFeature` in the input; defaults to
      // rank_tracking when omitted.
      keywordOverview: meter(customer, fetchKeywordOverview, "rank_tracking"),
      serpCompetitors: meter(customer, fetchSerpCompetitors),
    },
    lighthouse: {
      live: meter(customer, fetchLighthouseResult),
    },
    aiSearch: {
      mentionsSearch: meter(customer, fetchLlmMentionsSearch),
      aggregatedMetrics: meter(customer, fetchLlmAggregatedMetrics),
      topPages: meter(customer, fetchLlmTopPages),
      llmResponse: meter(customer, fetchLlmResponse),
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
