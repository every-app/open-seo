import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  autoReloadSettingsSchema,
  CHECKOUT_PLAN_IDS,
  TOP_UP_MAX_USD,
  TOP_UP_MIN_USD,
} from "@/shared/billing";
import { setOrganizationAutoReload } from "@/server/billing/auto-reload";
import {
  previewOrganizationPlanUpgrade,
  upgradeOrganizationPlan,
} from "@/server/billing/plan-upgrade";
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
import {
  captureMetaCheckoutStart,
  pinMetaCheckout,
} from "@/server/referrals/meta";
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

// The click on Subscribe. createPlanCheckout can't report it: the link is made
// ahead of time, when /subscribe loads.
export const reportCheckoutStart = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ planId: z.enum(CHECKOUT_PLAN_IDS) }))
  .handler(({ data }) => {
    captureMetaCheckoutStart(getRequest(), data.planId);
  });

const upgradePlanInput = z.object({ planId: z.enum(CHECKOUT_PLAN_IDS) });

export const previewPlanUpgrade = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(upgradePlanInput)
  .handler(({ data, context }) =>
    previewOrganizationPlanUpgrade(context, data),
  );

// Charges the saved card at once, unlike the checkouts above: the page shows
// the preview's charge before the click.
export const upgradePlan = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(upgradePlanInput)
  .handler(({ data, context }) =>
    upgradeOrganizationPlan(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

export const createTopUpCheckout = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      amountUsd: z.number().int().min(TOP_UP_MIN_USD).max(TOP_UP_MAX_USD),
    }),
  )
  .handler(({ data, context }) =>
    createTopUpCheckoutUrl(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

// Turning auto-reload on may charge the saved card for the first reload at
// once (see setOrganizationAutoReload); the page says so before the click.
// The threshold is fixed server-side, so the client chooses only the amount
// and the monthly limit.
export const setAutoReload = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.union([
      z.object({ enabled: z.literal(false) }),
      z.object({ enabled: z.literal(true) }).and(autoReloadSettingsSchema),
    ]),
  )
  .handler(({ data, context }) => setOrganizationAutoReload(context, data));

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
