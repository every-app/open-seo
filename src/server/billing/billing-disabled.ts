// Run AUTH_MODE=hosted without Autumn (e.g. a private team instance that pays
// DataForSEO directly and needs accounts and roles, but no metering).
//
// With OPENSEO_DISABLE_BILLING=1 the Autumn facade (autumn.ts), which every
// billing read and the /api/autumn route go through, answers locally: every
// org is on the paid plan with an
// unlimited credit balance, and nothing is metered. DataForSEO is paid
// directly, so the real spend lives in the DataForSEO account.
import {
  AUTUMN_MANAGED_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Large finite number instead of Infinity: it survives JSON and every
// `remaining >= required` comparison in the app and in autumn-js.
const UNLIMITED_CREDITS = 1_000_000_000;

export async function isBillingDisabled(): Promise<boolean> {
  const value = await getOptionalEnvValue("OPENSEO_DISABLE_BILLING");
  return value === "1" || value?.toLowerCase() === "true";
}

function unlimitedBalance(featureId: string) {
  return {
    featureId,
    feature: { id: featureId, name: featureId, type: "metered" },
    granted: UNLIMITED_CREDITS,
    remaining: UNLIMITED_CREDITS,
    usage: 0,
    unlimited: true,
    overageAllowed: false,
    maxPurchase: null,
    nextResetAt: null,
    breakdown: [],
  };
}

function paidFlag(featureId: string) {
  return {
    id: featureId,
    planId: "self_hosted",
    featureId,
    feature: { id: featureId, name: featureId, type: "boolean" },
    expiresAt: null,
  };
}

export function disabledBillingCustomer(customerId: string | null | undefined) {
  return {
    id: customerId ?? null,
    name: null,
    email: null,
    createdAt: 0,
    fingerprint: null,
    stripeId: null,
    env: "live",
    metadata: {},
    sendEmailReceipts: false,
    billingControls: {},
    subscriptions: [],
    purchases: [],
    balances: {
      [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]: unlimitedBalance(
        AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      ),
      [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: unlimitedBalance(
        AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      ),
    },
    flags: {
      [AUTUMN_PAID_PLAN_FEATURE_ID]: paidFlag(AUTUMN_PAID_PLAN_FEATURE_ID),
      [AUTUMN_MANAGED_ACCESS_FEATURE_ID]: paidFlag(
        AUTUMN_MANAGED_ACCESS_FEATURE_ID,
      ),
    },
  };
}

export function disabledBillingCheck(params: {
  customerId: string;
  featureId: string;
  entityId?: string;
  requiredBalance?: number;
}) {
  return {
    allowed: true,
    customerId: params.customerId,
    entityId: params.entityId ?? null,
    requiredBalance: params.requiredBalance ?? 1,
    balance: unlimitedBalance(params.featureId),
    flag: null,
  };
}
