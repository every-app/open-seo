import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseo";
import {
  normalizeBacklinksSpamFilterOptions,
  type BacklinksLookupInput,
  type BacklinksSpamFilterOptions,
} from "@/types/schemas/backlinks";
import {
  profileBacklinksOverview,
  profileBacklinksRowsPage,
  profileReferringDomainsPage,
  profileTopPagesPage,
  type BacklinksCache,
  type BacklinksRowsPageServiceInput,
  type ReferringDomainsPageServiceInput,
  type TopPagesPageServiceInput,
} from "@/server/features/backlinks/services/backlinksServiceData";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";

const defaultCache: BacklinksCache = {
  get: getCached,
  set: setCached,
};

type BacklinksPageCacheInput = {
  target: string;
  scope?: "domain" | "page";
  page: number;
  pageSize: number;
  sortField: string;
  sortOrder: string;
  filters: Record<string, unknown>;
  /** Backlinks rows only: DataForSEO result grouping. */
  mode?: string;
};

function createBacklinksService(cache: BacklinksCache = defaultCache) {
  return {
    async profileOverview(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
      // Lets a caller (e.g. onboarding) attribute the spend to its own credit
      // feature. Applied to the DataForSEO calls, not the cache key, so cached
      // results stay shared across callers.
      creditFeature?: CreditFeature,
    ) {
      const cacheKey = await buildCacheKey("backlinks:overview", {
        ...buildTargetCacheInput(input, billingCustomer),
      });

      return profileBacklinksOverview(
        cache,
        cacheKey,
        input,
        billingCustomer,
        creditFeature,
      );
    },
    async profileBacklinksPage(
      input: BacklinksRowsPageServiceInput,
      billingCustomer: BillingCustomerContext,
      options?: BacklinksSpamFilterOptions,
    ) {
      const cacheKey = await buildPageCacheKey(
        "backlinks:rows-page",
        input,
        billingCustomer,
        options,
      );

      return profileBacklinksRowsPage(
        cache,
        cacheKey,
        input,
        billingCustomer,
        options,
      );
    },
    async profileReferringDomainsPage(
      input: ReferringDomainsPageServiceInput,
      billingCustomer: BillingCustomerContext,
      options?: BacklinksSpamFilterOptions,
    ) {
      const cacheKey = await buildPageCacheKey(
        "backlinks:referring-domains-page",
        input,
        billingCustomer,
        options,
      );

      return profileReferringDomainsPage(
        cache,
        cacheKey,
        input,
        billingCustomer,
        options,
      );
    },
    async profileTopPagesPage(
      input: TopPagesPageServiceInput,
      billingCustomer: BillingCustomerContext,
    ) {
      const cacheKey = await buildPageCacheKey(
        "backlinks:top-pages-page",
        input,
        billingCustomer,
      );

      return profileTopPagesPage(cache, cacheKey, input, billingCustomer);
    },
  } as const;
}

function buildTargetCacheInput(
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
) {
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });

  return {
    organizationId: billingCustomer.organizationId,
    target: normalizedTarget.apiTarget,
    scope: normalizedTarget.scope,
  };
}

async function buildPageCacheKey(
  prefix: string,
  input: BacklinksPageCacheInput,
  billingCustomer: BillingCustomerContext,
  options?: BacklinksSpamFilterOptions,
): Promise<string> {
  const spamFilterOptions = normalizeBacklinksSpamFilterOptions(options);

  return buildCacheKey(prefix, {
    ...buildTargetCacheInput(input, billingCustomer),
    page: input.page,
    pageSize: input.pageSize,
    sortField: input.sortField,
    sortOrder: input.sortOrder,
    filters: input.filters,
    ...(input.mode ? { mode: input.mode } : {}),
    hideSpam: String(spamFilterOptions.hideSpam),
    ...(spamFilterOptions.hideSpam
      ? { spamThreshold: String(spamFilterOptions.spamThreshold) }
      : {}),
  });
}

export const BacklinksService = createBacklinksService();
export { createBacklinksService };
