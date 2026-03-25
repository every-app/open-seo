import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";
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
      return profileBacklinksOverview(
        cache,
        buildOverviewCacheKey(input, billingCustomer),
        input,
        billingCustomer,
      );
    },
    async profileReferringDomains(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
    ) {
      return profileReferringDomainsRows(
        cache,
        buildTabCacheKey("backlinks:referring-domains", input, billingCustomer),
        input,
        billingCustomer,
      );
    },
    async profileTopPages(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
    ) {
      return profileTopPagesRows(
        cache,
        buildTabCacheKey("backlinks:top-pages", input, billingCustomer),
        input,
        billingCustomer,
      );
    },
  } as const;
}

function buildOverviewCacheKey(
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
) {
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

function buildTabCacheKey(
  prefix: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
) {
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
