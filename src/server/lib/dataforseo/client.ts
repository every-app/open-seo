import {
  type CreditFeature,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import {
  assertUsageCreditsAvailable,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import type { BillingCustomerContext } from "@/server/billing/subscription";
// Type-only namespace import: erased at compile, so the section modules (and
// the SDK they pull in) still only load through loadDataforseoSections below.
import type * as sections from "@/server/lib/dataforseo/sections";
import {
  DataforseoChargedTaskError,
  type DataforseoApiCallCost,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import * as rankparseBacklinks from "@/server/lib/rankparse/backlinks";

export { mapDataforseoPathToCreditFeature };

/** The section-fetcher barrel (sections.ts), as a type for `meter` pickers. */
export type DataforseoSections = typeof sections;

let sectionsPromise: Promise<DataforseoSections> | undefined;

/** Single lazy boundary for the DataForSEO subtree: the section fetchers and
 * the ~3 MB dataforseo-client SDK they statically import stay out of the
 * eager isolate startup graph and load once, on the first API call. */
export function loadDataforseoSections(): Promise<DataforseoSections> {
  return (sectionsPromise ??= import("@/server/lib/dataforseo/sections"));
}

/**
 * Wraps a section fetcher with billing metering. Each entry on the client is
 * `meter(customer, (s) => s.fetchX, defaultFeature?)`, which returns a function
 * with the fetcher's own input type and resolves to its unwrapped `.data`. The
 * picker indirection (rather than the fetcher itself) keeps the section
 * modules behind loadDataforseoSections.
 *
 * `defaultFeature` is the fallback credit feature; a caller can override it per
 * call by passing `creditFeature` in the input (e.g. an MCP tool attributing
 * spend to its own feature). The extra field is ignored by the fetchers, which
 * read named fields rather than spreading the input.
 */
function meter<I, T>(
  customer: BillingCustomerContext,
  pick: (
    sections: DataforseoSections,
  ) => (input: I) => Promise<DataforseoApiResponse<T>>,
  defaultFeature?: CreditFeature,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      async () => pick(await loadDataforseoSections())(input),
      input.creditFeature ?? defaultFeature,
    );
}

type BacklinksProvider = "dataforseo" | "rankparse";

/**
 * Backlinks provider is purely additive/opt-in: DataForSEO is used unless a
 * self-hoster explicitly sets BACKLINKS_PROVIDER=rankparse. Merely setting
 * RANKPARSE_API_KEY does nothing by itself — that would let someone silently
 * lose history/spam-filtering/page-scope lookups just from adding a key,
 * without ever touching a provider flag. See docs/RANKPARSE_API_KEY.md.
 */
async function resolveBacklinksProvider(): Promise<BacklinksProvider> {
  const configured = await getOptionalEnvValue("BACKLINKS_PROVIDER");
  return configured === "rankparse" ? "rankparse" : "dataforseo";
}

/**
 * Backlinks-specific variant of `meter()`: resolves the configured provider
 * before picking a fetcher, so `BacklinksService` and the MCP tools stay
 * provider-agnostic. `rankparsePick` mirrors `dataforseoPick` 1:1 against
 * rankparse/backlinks.ts, which exports the same 5 fetcher names with the
 * same DataforseoApiResponse<T> shape (reusing dataforseo/backlinks.ts's Zod
 * schemas) so no downstream mapping code needs to know which provider ran.
 * If RANKPARSE_API_KEY is missing while opted in, the RankParse fetcher
 * itself throws a clear RANKPARSE_AUTH_FAILED error (see rankparse/client.ts)
 * rather than silently falling back — this is an explicit opt-in, so failing
 * loudly on misconfiguration is correct.
 */
function meterBacklinks<I, T>(
  customer: BillingCustomerContext,
  dataforseoPick: (
    sections: DataforseoSections,
  ) => (input: I) => Promise<DataforseoApiResponse<T>>,
  rankparsePick: (
    mod: typeof rankparseBacklinks,
  ) => (input: I) => Promise<DataforseoApiResponse<T>>,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return async (input) => {
    const provider = await resolveBacklinksProvider();
    if (provider === "rankparse") {
      return meterDataforseoCall(
        customer,
        async () => rankparsePick(rankparseBacklinks)(input),
        input.creditFeature,
        "rankparse",
      );
    }
    return meterDataforseoCall(
      customer,
      async () => dataforseoPick(await loadDataforseoSections())(input),
      input.creditFeature,
      "dataforseo",
    );
  };
}

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    business: {
      businessListings: meter(
        customer,
        (s) => s.fetchBusinessListingsSearch,
        "local_seo",
      ),
      questionsAnswers: meter(
        customer,
        (s) => s.fetchQuestionsAnswers,
        "local_seo",
      ),
    },
    backlinks: {
      summary: meterBacklinks(
        customer,
        (s) => s.fetchBacklinksSummary,
        (r) => r.fetchBacklinksSummary,
      ),
      rows: meterBacklinks(
        customer,
        (s) => s.fetchBacklinksRows,
        (r) => r.fetchBacklinksRows,
      ),
      referringDomains: meterBacklinks(
        customer,
        (s) => s.fetchReferringDomains,
        (r) => r.fetchReferringDomains,
      ),
      domainPages: meterBacklinks(
        customer,
        (s) => s.fetchDomainPagesSummary,
        (r) => r.fetchDomainPagesSummary,
      ),
      history: meterBacklinks(
        customer,
        (s) => s.fetchBacklinksHistory,
        (r) => r.fetchBacklinksHistory,
      ),
    },
    keywords: {
      related: meter(customer, (s) => s.fetchRelatedKeywords),
      suggestions: meter(customer, (s) => s.fetchKeywordSuggestions),
      ideas: meter(customer, (s) => s.fetchKeywordIdeas),
      // Google Ads endpoints for countries Labs doesn't support.
      adsIdeas: meter(customer, (s) => s.fetchAdsKeywordIdeas),
      adsSearchVolume: meter(customer, (s) => s.fetchAdsSearchVolume),
    },
    domain: {
      rankOverview: meter(customer, (s) => s.fetchDomainRankOverview),
      rankedKeywords: meter(customer, (s) => s.fetchRankedKeywords),
      relevantPages: meter(customer, (s) => s.fetchRelevantPages),
    },
    serp: {
      live: meter(customer, (s) => s.fetchLiveSerp),
      rankCheck: meter(customer, (s) => s.fetchRankCheckSerp, "rank_tracking"),
      // Posts up to 100 queued rank check tasks; one metered charge covers the
      // whole batch (DataForSEO bills task_post at post time, collection is
      // free).
      rankCheckTaskPost: meter(
        customer,
        (s) => s.postRankCheckTasks,
        "rank_tracking",
      ),
      local: meter(customer, (s) => s.fetchLocalSerp, "local_seo"),
    },
    labs: {
      // Callers (e.g. the keyword-metrics MCP tool) can attribute the spend to
      // their own feature by passing `creditFeature` in the input; defaults to
      // rank_tracking when omitted.
      keywordOverview: meter(
        customer,
        (s) => s.fetchKeywordOverview,
        "rank_tracking",
      ),
      serpCompetitors: meter(customer, (s) => s.fetchSerpCompetitors),
    },
    lighthouse: {
      live: meter(customer, (s) => s.fetchLighthouseResult),
    },
    aiSearch: {
      mentionsSearch: meter(customer, (s) => s.fetchLlmMentionsSearch),
      aggregatedMetrics: meter(customer, (s) => s.fetchLlmAggregatedMetrics),
      topPages: meter(customer, (s) => s.fetchLlmTopPages),
      crossAggregatedMetrics: meter(
        customer,
        (s) => s.fetchLlmCrossAggregatedMetrics,
      ),
      llmResponse: meter(customer, (s) => s.fetchLlmResponse),
    },
  } as const;
}

async function meterDataforseoCall<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  creditFeature?: CreditFeature,
  provider: BacklinksProvider = "dataforseo",
): Promise<T> {
  const isHostedMode = await isHostedServerAuthMode();

  if (!isHostedMode) {
    const result = await execute();
    return result.data;
  }

  const billingCustomer = await getOrCreateOrganizationCustomer(customer);

  const { monthlyRemaining } = await assertUsageCreditsAvailable(
    billingCustomer.id,
  );

  let result: DataforseoApiResponse<T>;
  try {
    result = await execute();
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError) {
      // A malformed request (DataForSEO "Invalid Field: ...") that DataForSEO
      // did not bill returns no value to the customer, so don't charge — surface
      // it as a non-reportable VALIDATION_ERROR. If DataForSEO still billed us
      // (costUsd > 0), fall through to the normal charge + capture path so the
      // spend stays metered and visible instead of silently eaten.
      if (error.isInvalidField && error.billing.costUsd <= 0) {
        throw new AppError("VALIDATION_ERROR", error.message);
      }
      await trackDataforseoCost({
        customer,
        customerId: billingCustomer.id,
        billing: error.billing,
        monthlyRemaining,
        creditFeature,
        provider,
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
    provider,
  });

  return result.data;
}

async function trackDataforseoCost(args: {
  customer: BillingCustomerContext;
  customerId: string;
  billing: DataforseoApiCallCost;
  monthlyRemaining: number;
  creditFeature?: CreditFeature;
  provider?: BacklinksProvider;
}) {
  await trackUsageCreditSpend({
    customer: args.customer,
    customerId: args.customerId,
    creditFeature:
      args.creditFeature ?? mapDataforseoPathToCreditFeature(args.billing.path),
    costUsd: args.billing.costUsd,
    monthlyRemaining: args.monthlyRemaining,
    properties: {
      provider: args.provider ?? "dataforseo",
      paths: [args.billing.path.join("/")],
      fromCache: false,
    },
  });
}
