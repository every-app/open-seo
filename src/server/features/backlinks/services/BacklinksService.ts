import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinks";
import {
  normalizeBacklinksSpamFilterOptions,
  type BacklinksSpamFilterOptions,
} from "@/types/schemas/backlinks";
import {
  profileBacklinksOverview,
  profileReferringDomainsRows,
  profileTopPagesRows,
  type BacklinksCache,
} from "@/server/features/backlinks/services/backlinksServiceData";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { BacklinksLookupInput } from "@/types/schemas/backlinks";

const defaultCache: BacklinksCache = {
  get: getCached,
  set: setCached,
};

function createBacklinksService(cache: BacklinksCache = defaultCache) {
  return {
    async profileOverview(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
      options?: BacklinksSpamFilterOptions,
    ) {
      const cacheKey = await buildBacklinksCacheKey(
        "backlinks:overview",
        input,
        billingCustomer,
        options,
      );

      return profileBacklinksOverview(
        cache,
        cacheKey,
        input,
        billingCustomer,
        options,
      );
    },
    async profileReferringDomains(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
      options?: BacklinksSpamFilterOptions,
    ) {
      const cacheKey = await buildBacklinksCacheKey(
        "backlinks:referring-domains",
        input,
        billingCustomer,
        options,
      );

      return profileReferringDomainsRows(
        cache,
        cacheKey,
        input,
        billingCustomer,
        options,
      );
    },
    async profileTopPages(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
    ) {
      const cacheKey = await buildBacklinksCacheKey(
        "backlinks:top-pages",
        input,
        billingCustomer,
      );

      return profileTopPagesRows(cache, cacheKey, input, billingCustomer);
    },
  } as const;
}

async function buildBacklinksCacheKey(
  prefix: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
  options?: BacklinksSpamFilterOptions,
): Promise<string> {
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  const cacheKeyInput = {
    organizationId: billingCustomer.organizationId,
    target: normalizedTarget.apiTarget,
    scope: normalizedTarget.scope,
  };

  if (!options) {
    return buildCacheKey(prefix, cacheKeyInput);
  }

  const spamFilterOptions = normalizeBacklinksSpamFilterOptions(options);

  return buildCacheKey(prefix, {
    ...cacheKeyInput,
    hideSpam: String(spamFilterOptions.hideSpam),
    ...(spamFilterOptions.hideSpam
      ? { spamThreshold: String(spamFilterOptions.spamThreshold) }
      : {}),
  });
}

export const BacklinksService = createBacklinksService();
export { createBacklinksService };
