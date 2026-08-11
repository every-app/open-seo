import type {
  BacklinksLookupInput,
  BacklinksSpamFilterOptions,
} from "@/types/schemas/backlinks";
import {
  profileBacklinksOverview,
  profileBacklinksRowsPage,
  profileReferringDomainsPage,
  profileTopPagesPage,
  type BacklinksRowsPageServiceInput,
  type ReferringDomainsPageServiceInput,
  type TopPagesPageServiceInput,
} from "@/server/features/backlinks/services/backlinksServiceData";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";

function createBacklinksService() {
  return {
    async profileOverview(
      input: BacklinksLookupInput,
      billingCustomer: BillingCustomerContext,
      // Lets a caller (e.g. onboarding) attribute the spend to its own credit
      // feature. Applied to the DataForSEO calls, not the cache key, so cached
      // results stay shared across callers.
      creditFeature?: CreditFeature,
    ) {
      return profileBacklinksOverview(input, billingCustomer, creditFeature);
    },
    async profileBacklinksPage(
      input: BacklinksRowsPageServiceInput,
      billingCustomer: BillingCustomerContext,
      options?: BacklinksSpamFilterOptions,
    ) {
      return profileBacklinksRowsPage(input, billingCustomer, options);
    },
    async profileReferringDomainsPage(
      input: ReferringDomainsPageServiceInput,
      billingCustomer: BillingCustomerContext,
      options?: BacklinksSpamFilterOptions,
    ) {
      return profileReferringDomainsPage(input, billingCustomer, options);
    },
    async profileTopPagesPage(
      input: TopPagesPageServiceInput,
      billingCustomer: BillingCustomerContext,
    ) {
      return profileTopPagesPage(input, billingCustomer);
    },
  } as const;
}

export const BacklinksService = createBacklinksService();
export { createBacklinksService };
