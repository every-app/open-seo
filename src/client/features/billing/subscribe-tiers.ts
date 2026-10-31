import {
  AGENCY_PLAN_OFFER,
  BASE_PLAN_OFFER,
  PRO_PLAN_OFFER,
  type PlanOffer,
} from "@/client/features/billing/plan-offers";

// The tiers on openseo.so/pricing, with the same copy. Its "Get started"
// links highlight one with ?plan=. Annual prices are the hidden yearly plans
// in Autumn, which support sets up by email until checkout can sell them.
export const TIERS = {
  base: {
    offer: BASE_PLAN_OFFER,
    annualPriceUsd: 100,
    description: "For your own website.",
    features: [
      "Keyword research, backlinks, rank tracking, and site audits",
      "AI visibility, prompt research, and tracking",
      "Works inside Claude, Cursor, and ChatGPT",
      "Free Google Search Console data",
    ],
  },
  pro: {
    offer: PRO_PLAN_OFFER,
    annualPriceUsd: 300,
    description: "For freelancers and growing teams.",
    features: [
      "Everything in Base",
      "20% more usage than you pay for",
      "Priority email support",
    ],
  },
  agency: {
    offer: AGENCY_PLAN_OFFER,
    annualPriceUsd: 2000,
    description: "For agencies with many clients.",
    features: [
      "Everything in Pro",
      "20% more usage than you pay for",
      "Dedicated Slack Connect channel",
      "AI enablement: hands-on help setting up agents and workflows for your team",
    ],
  },
} satisfies Record<
  string,
  {
    offer: PlanOffer;
    annualPriceUsd: number;
    description: string;
    features: string[];
  }
>;
export type Tier = keyof typeof TIERS;

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && Object.hasOwn(TIERS, value);
}
