import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { CHECKOUT_PLAN_IDS } from "@/shared/billing";
import { getOrganizationBillingAccount } from "@/server/billing/billing-account";
import {
  createBillingPortalUrl,
  createPlanCheckoutUrl,
  createTopUpCheckoutUrl,
} from "@/server/billing/checkout";
import {
  listOrganizationInvoices,
  setOrganizationInvoiceEmails,
} from "@/server/billing/invoices";
import { getOrganizationBillingUsage } from "@/server/billing/usage";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { pinMetaCheckout } from "@/server/referrals/meta";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { timeZoneSchema } from "@/types/schemas/schedule-time";

export const getBillingAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => getOrganizationBillingAccount(context));

// Each returns a URL for the browser to open: Stripe or Autumn checkout, or
// the Stripe billing portal.

export const createPlanCheckout = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      planId: z.enum(CHECKOUT_PLAN_IDS),
      redirectTo: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const request = getRequest();
    const url = await createPlanCheckoutUrl(context, {
      ...data,
      origin: getPublicOrigin(request),
    });
    // The buyer's browser is only here, not at the webhook that confirms the
    // subscription, so the Meta ad conversion is set up now.
    await pinMetaCheckout(context.organizationId, request);
    return url;
  });

export const createTopUpCheckout = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ amountUsd: z.number().int().min(10).max(99) }))
  .handler(({ data, context }) =>
    createTopUpCheckoutUrl(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ returnTo: z.string() }))
  .handler(({ data, context }) =>
    createBillingPortalUrl(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

export const listBillingInvoices = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => listOrganizationInvoices(context));

export const setInvoiceEmails = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ enabled: z.boolean() }))
  .handler(({ data, context }) =>
    setOrganizationInvoiceEmails(context, data.enabled),
  );

export const getBillingUsage = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ timezone: timeZoneSchema }))
  .handler(({ data, context }) =>
    getOrganizationBillingUsage(context.organizationId, data.timezone),
  );
