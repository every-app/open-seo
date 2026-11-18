import { sort, sumBy } from "remeda";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";
import { creditFeatureLabel } from "@/shared/billing-credit-features";
import { autumn } from "@/server/billing/autumn";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";

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
  const groupedBy = (property: string) =>
    autumn.events.aggregate({
      ...params,
      groupBy: `properties.${property}`,
      // More groups than credit features, so Autumn never folds one into its
      // own "Other". Past 20 projects in a day, the rest land in Other.
      maxGroups: 20,
    });
  const [byDay, byFeature, byProject, projects, archivedProjects] =
    await Promise.all([
      autumn.events.aggregate(params),
      // Every billed usage event names its feature, and its project when it
      // has one.
      groupedBy("creditFeature"),
      groupedBy("projectId"),
      ProjectRepository.listProjects(organizationId),
      ProjectRepository.listArchivedProjects(organizationId),
    ]);

  // Only this organization's projects get a name; any other id reads as Other.
  const projectNames = new Map([
    ...projects.map((p) => [p.id, p.name] as const),
    ...archivedProjects.map((p) => [p.id, `${p.name} (archived)`] as const),
  ]);

  return {
    days: byDay.list.map((bin) => ({
      date: bin.period,
      usd: autumnSeoDataCreditsToUsd(
        sumBy(USAGE_FEATURE_IDS, (featureId) => bin.values[featureId] ?? 0),
      ),
    })),
    features: usageRows(byFeature, creditFeatureLabel, "Other"),
    // Usage before projects were recorded, or with no project, is Workspace.
    projects: usageRows(
      byProject,
      (id) => projectNames.get(id) ?? "Other",
      "Workspace",
    ),
  };
}

type GroupedUsage = Awaited<ReturnType<typeof autumn.events.aggregate>>;

/** USD per group label, largest first. Events without the property count
 *  under `ungroupedLabel`. */
function usageRows(
  usage: GroupedUsage,
  labelFor: (group: string) => string,
  ungroupedLabel: string,
) {
  const creditsByLabel = new Map<string, number>();
  const addCredits = (label: string, credits: number) =>
    creditsByLabel.set(label, (creditsByLabel.get(label) ?? 0) + credits);
  let groupedCredits = 0;
  for (const bin of usage.list) {
    for (const featureId of USAGE_FEATURE_IDS) {
      const groups = bin.groupedValues?.[featureId] ?? {};
      for (const [group, credits] of Object.entries(groups)) {
        addCredits(labelFor(group), credits);
        groupedCredits += credits;
      }
    }
  }
  const totalCredits = sumBy(
    USAGE_FEATURE_IDS,
    (featureId) => usage.total[featureId]?.sum ?? 0,
  );
  addCredits(ungroupedLabel, totalCredits - groupedCredits);

  // Refunds can leave a group at or below zero; those rows are hidden.
  return sort(
    [...creditsByLabel]
      .map(([label, credits]) => ({
        label,
        usd: autumnSeoDataCreditsToUsd(credits),
      }))
      .filter((row) => row.usd > 0),
    (a, b) => b.usd - a.usd,
  );
}

export type BillingUsage = Awaited<
  ReturnType<typeof getOrganizationBillingUsage>
>;
