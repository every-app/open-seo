import {
  AUTUMN_PAID_PLAN_ID,
  AUTUMN_YC_PLAN_ID,
  type CheckoutPlanId,
} from "@/shared/billing";

// What a checkout page advertises before the customer holds the plan. Once
// they do, status and credits come from the Autumn customer (see
// billing-account.ts) and only the name is read from here (getPlanName), so
// these only need to match the Autumn plans they sell.
export type PlanOffer = {
  planId: CheckoutPlanId;
  name: string;
  priceUsd: number;
  monthlyCreditsUsd: number;
};

export const BASE_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_PAID_PLAN_ID,
  name: "Base Plan",
  priceUsd: 10,
  monthlyCreditsUsd: 10,
};

export const YC_PLAN_OFFER: PlanOffer = {
  planId: AUTUMN_YC_PLAN_ID,
  name: "YC Plan",
  priceUsd: 50,
  monthlyCreditsUsd: 50,
};

/** A plan's display name. Plans without an offer here (friends and family)
 *  show their ID, which is also their name in Autumn. */
export function getPlanName(planId: string) {
  return (
    [BASE_PLAN_OFFER, YC_PLAN_OFFER].find((offer) => offer.planId === planId)
      ?.name ?? planId
  );
}

export function monthlyCreditsFeature(offer: PlanOffer) {
  return `Includes $${offer.monthlyCreditsUsd.toFixed(2)} of Usage Credits each month`;
}
