import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinks";
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
    ) {
      const cacheKey = await buildOverviewCacheKey(input, billingCustomer);

      return profileBacklinksOverview(cache, cacheKey, input, billingCustomer);
    },
    async profileReferringDomains(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
    ) {
      const cacheKey = await buildTabCacheKey(
        "backlinks:referring-domains",
        input,
        billingCustomer,
      );

      return profileReferringDomainsRows(
        cache,
        cacheKey,
        input,
        billingCustomer,
      );
    },
    async profileTopPages(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
    ) {
      const cacheKey = await buildTabCacheKey(
        "backlinks:top-pages",
        input,
        billingCustomer,
      );

      return profileTopPagesRows(cache, cacheKey, input, billingCustomer);
    },
  } as const;
}

async function buildOverviewCacheKey(
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<string> {
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  return buildCacheKey("backlinks:overview", {
    organizationId: billingCustomer.organizationId,
    target: normalizedTarget.apiTarget,
    scope: normalizedTarget.scope,
    includeSubdomains: input.includeSubdomains,
    includeIndirectLinks: input.includeIndirectLinks,
    excludeInternalBacklinks: input.excludeInternalBacklinks,
    status: input.status,
  });
}

async function buildTabCacheKey(
  prefix: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<string> {
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  return buildCacheKey(prefix, {
    organizationId: billingCustomer.organizationId,
    target: normalizedTarget.apiTarget,
    scope: normalizedTarget.scope,
    includeSubdomains: input.includeSubdomains,
    includeIndirectLinks: input.includeIndirectLinks,
    excludeInternalBacklinks: input.excludeInternalBacklinks,
    status: input.status,
  });
}

export const BacklinksService = createBacklinksService();
export { createBacklinksService };
