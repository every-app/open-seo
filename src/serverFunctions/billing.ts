import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_PAID_PLAN_ID,
} from "@/shared/billing";
import { autumn } from "@/server/billing/autumn";
import {
  getOrCreateOrganizationCustomer,
  hasActivePaidPlan,
} from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { requireEnsuredUserContext } from "@/serverFunctions/middleware";

const billingReturnUrlSchema = z.object({
  returnUrl: z.string().url(),
});

const backlinksTopUpSchema = z.object({
  returnUrl: z.string().url(),
  amount: z.number().int().min(10).max(99),
});

export const getHostedBillingStatus = createServerFn({ method: "GET" })
  .middleware(requireEnsuredUserContext)
  .handler(async ({ context }) => {
    const customer = await getOrCreateOrganizationCustomer(context);
    const balance =
      customer.balances[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID] ?? null;
    const hasPaidPlan = hasActivePaidPlan(customer);

    return {
      customerId: customer.id,
      hasPaidPlan,
      balance: balance
        ? {
            featureId: balance.featureId,
            granted: autumnSeoDataCreditsToUsd(balance.granted),
            remaining: autumnSeoDataCreditsToUsd(balance.remaining),
            usage: autumnSeoDataCreditsToUsd(balance.usage),
            nextResetAt: balance.nextResetAt ?? null,
          }
        : null,
    };
  });

export const createHostedSubscriptionCheckout = createServerFn({
  method: "POST",
})
  .middleware(requireEnsuredUserContext)
  .inputValidator((data: unknown) => billingReturnUrlSchema.parse(data))
  .handler(async ({ context, data }) => {
    const customer = await getOrCreateOrganizationCustomer(context);
    const response = await autumn.billing.attach({
      customerId: customer.id,
      planId: AUTUMN_PAID_PLAN_ID,
      redirectMode: "always",
      successUrl: data.returnUrl,
    });

    return { url: response.paymentUrl };
  });

export const createBacklinksTopUpCheckout = createServerFn({ method: "POST" })
  .middleware(requireEnsuredUserContext)
  .inputValidator((data: unknown) => backlinksTopUpSchema.parse(data))
  .handler(async ({ context, data }) => {
    const customer = await getOrCreateOrganizationCustomer(context);

    if (!hasActivePaidPlan(customer)) {
      throw new AppError("PAYMENT_REQUIRED");
    }

    const response = await autumn.billing.attach({
      customerId: customer.id,
      planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
      redirectMode: "always",
      successUrl: data.returnUrl,
      featureQuantities: [
        {
          featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
          quantity: Math.round(data.amount * AUTUMN_SEO_DATA_CREDITS_PER_USD),
        },
      ],
    });

    return { url: response.paymentUrl };
  });

export const openHostedBillingPortal = createServerFn({ method: "POST" })
  .middleware(requireEnsuredUserContext)
  .inputValidator((data: unknown) => billingReturnUrlSchema.parse(data))
  .handler(async ({ context, data }) => {
    const customer = await getOrCreateOrganizationCustomer(context);
    const response = await autumn.billing.openCustomerPortal({
      customerId: customer.id,
      returnUrl: data.returnUrl,
    });

    return { url: response.url };
  });
