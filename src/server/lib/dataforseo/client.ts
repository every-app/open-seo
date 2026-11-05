import { waitUntil } from "cloudflare:workers";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { creditsForProviderUsd } from "@/shared/billing";
import {
  getOrCreateOrganizationCustomer,
  reserveUsageCredits,
  settleUsageCredits,
} from "@/server/billing/subscription";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  DataforseoChargedTaskError,
  type DataforseoApiCallCost,
  type DataforseoApiResponse,
  invalidFieldName,
} from "@/server/lib/dataforseo/envelope";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import {
  fetchBusinessListingsSearch,
  fetchMyBusinessInfo,
  fetchQuestionsAnswers,
  postGoogleReviewsTask,
  postMyBusinessUpdatesTask,
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
  fetchAdsKeywordIdeas,
  fetchAdsSearchVolume,
} from "@/server/lib/dataforseo/google-ads";
import {
  fetchLocalSerp,
  postLocalSerpTasks,
  postSerpReadTasks,
  type SerpQuery,
  postRankCheckTasks,
} from "@/server/lib/dataforseo/serp";
import { fetchLighthouseResult } from "@/server/lib/dataforseo/lighthouse";
import {
  fetchLlmAggregatedMetrics,
  fetchLlmCrossAggregatedMetrics,
  fetchLlmMentionsSearch,
  fetchLlmResponse,
  fetchLlmTopPages,
} from "@/server/lib/dataforseo/ai";
import { fetchAiTrackingLiveAnswer } from "@/server/lib/dataforseo/ai-tracking";
import {
  postAiTrackingTasksOnHold,
  settleAiTrackingHold,
  type AiTrackingHold,
} from "@/server/lib/dataforseo/ai-tracking-billing";
import { inDataforseoSlot } from "@/server/lib/dataforseo/request-slots";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

/**
 * Wraps a section fetcher with billing metering. Each entry on the client is
 * `meter(customer, fetchX, dataforseoPricing.section.x, defaultFeature)`,
 * which returns a function with the fetcher's own input type and resolves to
 * its unwrapped `.data`.
 *
 * `estimateRawUsd` is required: it is the upper bound reserved before the
 * call, so an entry cannot be added without a price (see pricing.ts).
 *
 * `defaultFeature` goes on the hold: Autumn keeps the hold and its settle as
 * separate events, so a feature set only at settle reads as "Other". Callers
 * can override it with `creditFeature` in the input (fetchers ignore it).
 */
function meter<I, T>(
  customer: BillingCustomerContext,
  fetcher: (input: I) => Promise<DataforseoApiResponse<T>>,
  estimateRawUsd: (input: I) => number,
  defaultFeature: CreditFeature,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      () => fetcher(input),
      creditsForProviderUsd(estimateRawUsd(input)),
      input.creditFeature ?? defaultFeature,
    );
}

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    business: {
      businessListings: meter(
        customer,
        fetchBusinessListingsSearch,
        dataforseoPricing.business.businessListings,
        "local_seo",
      ),
      questionsAnswers: meter(
        customer,
        fetchQuestionsAnswers,
        dataforseoPricing.business.questionsAnswers,
        "local_seo",
      ),
      myBusinessInfo: meter(
        customer,
        fetchMyBusinessInfo,
        dataforseoPricing.business.myBusinessInfo,
        "local_seo",
      ),
      // task_post is where DataForSEO charges; collection runs unmetered
      // through fetchBusinessDataTaskResult (see index.ts).
      reviewsTaskPost: meter(
        customer,
        postGoogleReviewsTask,
        dataforseoPricing.business.reviewsTaskPost,
        "local_seo",
      ),
      updatesTaskPost: meter(
        customer,
        postMyBusinessUpdatesTask,
        dataforseoPricing.business.updatesTaskPost,
        "local_seo",
      ),
    },
    backlinks: {
      summary: meter(
        customer,
        fetchBacklinksSummary,
        dataforseoPricing.backlinks.summary,
        "backlinks",
      ),
      rows: meter(
        customer,
        fetchBacklinksRows,
        dataforseoPricing.backlinks.rows,
        "backlinks",
      ),
      referringDomains: meter(
        customer,
        fetchReferringDomains,
        dataforseoPricing.backlinks.referringDomains,
        "backlinks",
      ),
      domainPages: meter(
        customer,
        fetchDomainPagesSummary,
        dataforseoPricing.backlinks.domainPages,
        "backlinks",
      ),
      history: meter(
        customer,
        fetchBacklinksHistory,
        dataforseoPricing.backlinks.history,
        "backlinks",
      ),
    },
    keywords: {
      related: meter(
        customer,
        fetchRelatedKeywords,
        dataforseoPricing.keywords.related,
        "keyword_research",
      ),
      suggestions: meter(
        customer,
        fetchKeywordSuggestions,
        dataforseoPricing.keywords.suggestions,
        "keyword_research",
      ),
      ideas: meter(
        customer,
        fetchKeywordIdeas,
        dataforseoPricing.keywords.ideas,
        "keyword_research",
      ),
      // Google Ads endpoints for countries Labs doesn't support.
      adsIdeas: meter(
        customer,
        fetchAdsKeywordIdeas,
        dataforseoPricing.keywords.adsIdeas,
        "keyword_research",
      ),
      adsSearchVolume: meter(
        customer,
        fetchAdsSearchVolume,
        dataforseoPricing.keywords.adsSearchVolume,
        "keyword_research",
      ),
    },
    domain: {
      rankOverview: meter(
        customer,
        fetchDomainRankOverview,
        dataforseoPricing.domain.rankOverview,
        "domain_overview",
      ),
      rankedKeywords: meter(
        customer,
        fetchRankedKeywords,
        dataforseoPricing.domain.rankedKeywords,
        "domain_overview",
      ),
      relevantPages: meter(
        customer,
        fetchRelevantPages,
        dataforseoPricing.domain.relevantPages,
        "domain_overview",
      ),
    },
    serp: {
      // Posts each query's reads; one credit hold covers the batch, and each
      // query is placed and refused as its own hold would be (see
      // meterDataforseoCalls). DataForSEO bills task_post, collection is free.
      // Resolves per query, in order.
      readsTaskPostBatch: (inputs: SerpQuery[]) =>
        meterDataforseoCalls(
          customer,
          inputs.map((input) => () => postSerpReadTasks(input)),
          inputs.map((input) =>
            creditsForProviderUsd(dataforseoPricing.serp.readsTaskPost(input)),
          ),
          "keyword_research",
        ),
      // Posts up to 100 queued rank check tasks; one metered charge covers the
      // whole batch (DataForSEO bills task_post at post time, collection is
      // free).
      rankCheckTaskPost: meter(
        customer,
        postRankCheckTasks,
        dataforseoPricing.serp.rankCheckTaskPost,
        "rank_tracking",
      ),
      local: meter(
        customer,
        fetchLocalSerp,
        dataforseoPricing.serp.local,
        "local_seo",
      ),
      // Live Maps searches for a Local SEO check, one per grid point; one
      // credit hold covers the batch.
      localBatch: (inputs: Parameters<typeof fetchLocalSerp>[0][]) =>
        meterDataforseoCalls(
          customer,
          inputs.map((input) => () => fetchLocalSerp(input)),
          inputs.map((input) =>
            creditsForProviderUsd(dataforseoPricing.serp.local(input)),
          ),
          "local_seo",
        ),
      // One queued Maps task per rank grid point; one metered charge covers
      // them all (DataForSEO bills task_post, collection is free).
      localTaskPost: meter(
        customer,
        postLocalSerpTasks,
        dataforseoPricing.serp.localTaskPost,
        "local_seo",
      ),
    },
    labs: {
      // Callers (e.g. the keyword-metrics MCP tool) can attribute the spend to
      // their own feature by passing `creditFeature` in the input; defaults to
      // rank_tracking when omitted.
      keywordOverview: meter(
        customer,
        fetchKeywordOverview,
        dataforseoPricing.labs.keywordOverview,
        "rank_tracking",
      ),
      serpCompetitors: meter(
        customer,
        fetchSerpCompetitors,
        dataforseoPricing.labs.serpCompetitors,
        "keyword_research",
      ),
    },
    lighthouse: {
      live: meter(
        customer,
        fetchLighthouseResult,
        dataforseoPricing.lighthouse.live,
        "site_audit",
      ),
    },
    aiSearch: {
      mentionsSearch: meter(
        customer,
        fetchLlmMentionsSearch,
        dataforseoPricing.aiSearch.mentionsSearch,
        "ai_citations",
      ),
      aggregatedMetrics: meter(
        customer,
        fetchLlmAggregatedMetrics,
        dataforseoPricing.aiSearch.aggregatedMetrics,
        "ai_citations",
      ),
      topPages: meter(
        customer,
        fetchLlmTopPages,
        dataforseoPricing.aiSearch.topPages,
        "ai_citations",
      ),
      crossAggregatedMetrics: meter(
        customer,
        fetchLlmCrossAggregatedMetrics,
        dataforseoPricing.aiSearch.crossAggregatedMetrics,
        "ai_citations",
      ),
      llmResponse: meter(
        customer,
        fetchLlmResponse,
        dataforseoPricing.aiSearch.llmResponse,
        "ai_prompt_responses",
      ),
      // Posts up to 100 tracked prompts for one engine on an open credit
      // hold. DataForSEO bills task_post, but the customer pays only for the
      // answers that arrive: the caller settles the hold with
      // settleTrackingHold once collection ends.
      trackingTaskPost: (
        input: Parameters<typeof postAiTrackingTasksOnHold>[1],
      ) => postAiTrackingTasksOnHold(customer, input),
      settleTrackingHold: (input: {
        hold: AiTrackingHold;
        /** One per task whose answer arrived. */
        costs: number[];
      }) => settleAiTrackingHold(customer, input),
      // A manual run's live answers share one credit hold and one settle (see
      // meterDataforseoCalls). Resolves per call, in order.
      trackingLiveBatch: (
        inputs: Parameters<typeof fetchAiTrackingLiveAnswer>[0][],
      ) =>
        meterDataforseoCalls(
          customer,
          inputs.map((input) => () => fetchAiTrackingLiveAnswer(input)),
          inputs.map((input) =>
            creditsForProviderUsd(
              dataforseoPricing.aiSearch.trackingLive(input),
            ),
          ),
          "ai_prompt_responses",
        ),
    },
  } as const;
}

/**
 * The one seam every DataForSEO charge passes through (hosted mode only).
 * Order: reserve the estimate on the org's credits -> provider calls -> settle
 * the hold on their real cost. The hold is atomic in Autumn, so concurrent
 * calls cannot all pass on one stale balance reading.
 *
 * A batch of calls shares one hold and one settle per credit pool it draws
 * on, with each call placed and refused as its own hold would be (see
 * reserveUsageCredits): holding and settling per call sent up to 40 Autumn
 * requests per rank check batch, and enough of them hit the SDK's timeout to
 * drop charges.
 */
async function meterDataforseoCalls<T>(
  customer: BillingCustomerContext,
  executes: Array<() => Promise<DataforseoApiResponse<T>>>,
  callCredits: number[],
  creditFeature: CreditFeature,
): Promise<PromiseSettledResult<T>[]> {
  if (executes.length === 0) return [];
  const isHostedMode = await isHostedServerAuthMode();

  if (!isHostedMode) {
    return Promise.allSettled(
      executes.map(async (execute) => (await execute()).data),
    );
  }

  const billingCustomer = await getOrCreateOrganizationCustomer(customer);
  const { holds, refusedCalls } = await reserveUsageCredits({
    customer,
    customerId: billingCustomer.id,
    callCredits,
    creditFeature,
  });

  const work = (async () => {
    const billed: Array<DataforseoApiCallCost | null> = executes.map(
      () => null,
    );
    const settled = await Promise.allSettled(
      executes.map(async (execute, index) => {
        if (refusedCalls.includes(index)) {
          throw new AppError("INSUFFICIENT_CREDITS");
        }
        try {
          const result = await execute();
          billed[index] = result.billing;
          return result.data;
        } catch (error) {
          // Transport / auth / upstream failure: nothing was billed.
          if (!(error instanceof DataforseoChargedTaskError)) throw error;
          // A malformed request (DataForSEO "Invalid Field: ...") that
          // DataForSEO did not bill returns no value to the customer, so don't
          // charge — surface it as a non-reportable VALIDATION_ERROR. If
          // DataForSEO still billed us (costUsd > 0), charge that cost so the
          // spend stays metered and visible instead of silently eaten.
          if (error.isInvalidField && error.billing.costUsd <= 0) {
            // Non-reportable, so this is the only record. The field name, not
            // the message, which quotes the value that was sent.
            console.warn("dataforseo.invalid-field", {
              event: "dataforseo.invalid-field",
              path: `/${error.billing.path.join("/")}`,
              field: invalidFieldName(error.message),
            });
            throw new AppError("VALIDATION_ERROR", error.message);
          }
          billed[index] = error.billing;
          throw error;
        }
      }),
    );

    for (const hold of holds) {
      const costs = hold.callIndexes
        .map((index) => billed[index])
        .filter((cost) => cost !== null);
      await settleUsageCredits({ customer, hold, creditFeature, costs });
    }
    return settled;
  })();

  // Register the calls + settle with the request: workerd cancels pending I/O
  // once the client goes away, and a hold that never settles would let a
  // disconnect-after-dispatch skip the deduction. The rejection is handled by
  // the await below; the background handle only keeps the chain alive.
  try {
    waitUntil(work.catch(() => undefined));
  } catch {
    // No request context (Workflow step, tests): the await below runs it.
  }
  return await work;
}

async function meterDataforseoCall<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  estimatedCredits: number,
  creditFeature: CreditFeature,
): Promise<T> {
  // Each single call settles as soon as it answers, so cap how many run at
  // once (request-slots.ts). A batch settles after all of its calls answer,
  // so it doesn't need the cap.
  const [result] = await meterDataforseoCalls(
    customer,
    [() => inDataforseoSlot(execute)],
    [estimatedCredits],
    creditFeature,
  );
  if (result.status === "rejected") throw result.reason;
  return result.value;
}
