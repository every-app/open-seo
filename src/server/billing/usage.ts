import { sort, sumBy } from "remeda";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";
import { creditFeatureLabel } from "@/shared/billing-credit-features";
import { autumn } from "@/server/billing/autumn";

const USAGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_FEATURE_IDS = [
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
];

/** The organization's usage over the last 30 days, in USD, as the billing
 *  page charts it. */
export async function getOrganizationBillingUsage(
  organizationId: string,
  timezone: string,
) {
  const end = Date.now();
  const params = {
    customerId: organizationId,
    featureId: USAGE_FEATURE_IDS,
    customRange: { start: end - USAGE_DAYS * DAY_MS, end },
    // One bin per day in the viewer's timezone, from 30 days ago to today.
    binSize: "day" as const,
    timezone,
  };
  const [byDay, byFeature] = await Promise.all([
    autumn.events.aggregate(params),
    autumn.events.aggregate({
      ...params,
      // Every billed usage event names its feature here. More groups than
      // credit features, so Autumn never folds one into its own "Other".
      groupBy: "properties.creditFeature",
      maxGroups: 20,
    }),
  ]);

  const creditsByLabel = new Map<string, number>();
  const addCredits = (label: string, credits: number) =>
    creditsByLabel.set(label, (creditsByLabel.get(label) ?? 0) + credits);
  let groupedCredits = 0;
  for (const bin of byFeature.list) {
    for (const featureId of USAGE_FEATURE_IDS) {
      const groups = bin.groupedValues?.[featureId] ?? {};
      for (const [feature, credits] of Object.entries(groups)) {
        addCredits(creditFeatureLabel(feature), credits);
        groupedCredits += credits;
      }
    }
  }
  // Grouping drops events without a credit feature; they count as Other.
  const totalCredits = sumBy(
    USAGE_FEATURE_IDS,
    (featureId) => byFeature.total[featureId]?.sum ?? 0,
  );
  addCredits("Other", totalCredits - groupedCredits);

  return {
    days: byDay.list.map((bin) => ({
      date: bin.period,
      usd: autumnSeoDataCreditsToUsd(
        sumBy(USAGE_FEATURE_IDS, (featureId) => bin.values[featureId] ?? 0),
      ),
    })),
    // Refunds can leave a feature at or below zero; those rows are hidden.
    features: sort(
      [...creditsByLabel]
        .map(([label, credits]) => ({
          label,
          usd: autumnSeoDataCreditsToUsd(credits),
        }))
        .filter((row) => row.usd > 0),
      (a, b) => b.usd - a.usd,
    ),
  };
}

export type BillingUsage = Awaited<
  ReturnType<typeof getOrganizationBillingUsage>
>;
