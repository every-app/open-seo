import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import type { DomainMetricsItem } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { getSeoDataRouter } from "@/server/lib/seo-data";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { getPagesPage } from "@/server/features/domain/services/domainPagesPage";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";

const BACKLINK_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

async function getFreshBacklinkSnapshot(input: {
  projectId: string;
  domain: string;
}) {
  try {
    return await BacklinkSnapshotRepository.getFreshForProjectDomain({
      projectId: input.projectId,
      domain: input.domain,
      maxAgeMs: BACKLINK_SNAPSHOT_MAX_AGE_MS,
    });
  } catch (error) {
    console.error("domain-overview.backlink-snapshot.read:", error);
    return null;
  }
}

// Lets a caller attribute spend to its own feature (e.g. onboarding). Applied
// to the DataForSEO call, not the cache key, so cached results are shared
// across callers.
type MeteringOverrides = {
  creditFeature?: CreditFeature;
};

const domainOverviewResultSchema = z.object({
  domain: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  hasData: z.boolean(),
  fetchedAt: z.string(),
});

type DomainOverviewResult = z.infer<typeof domainOverviewResultSchema>;

/** Loose passthrough schemas for the raw router payloads. The router validates
 *  cached data against these, so stale schema versions are treated as a miss. */
const domainOverviewRouterDataSchema = z.array(z.unknown());
const suggestedKeywordsRouterDataSchema = z.object({
  items: z.array(z.unknown()),
  totalCount: z.number().nullable(),
});

async function getOverview(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<DomainOverviewResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);

  const [response, backlinkSnapshot] = await Promise.all([
    getSeoDataRouter().route<DomainMetricsItem[]>(
      {
        dataType: "domain_overview",
        domain,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        billingCustomer,
        creditFeature: metering.creditFeature,
        constraints: { projectId: input.projectId },
      },
      domainOverviewRouterDataSchema,
    ),
    getFreshBacklinkSnapshot({
      projectId: input.projectId,
      domain,
    }),
  ]);

  const metrics: DomainMetricsItem | undefined = response.data[0];

  const organicTraffic =
    metrics?.metrics?.organic?.etv != null
      ? Math.round(metrics.metrics.organic.etv)
      : null;
  const organicKeywords =
    metrics?.metrics?.organic?.count != null
      ? Math.round(metrics.metrics.organic.count)
      : null;

  return {
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: backlinkSnapshot?.backlinks ?? null,
    referringDomains: backlinkSnapshot?.referringDomains ?? null,
    hasData: organicKeywords != null && organicKeywords > 0,
    fetchedAt: new Date().toISOString(),
  };
}

async function getSuggestedKeywords(
  input: {
    domain: string;
    locationCode: number;
    languageCode: string;
    organizationId: string;
    projectId: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<
  Array<{
    keyword: string;
    position: number | null;
    searchVolume: number | null;
    traffic: number | null;
    cpc: number | null;
    keywordDifficulty: number | null;
  }>
> {
  const domain = normalizeDomainInput(input.domain, true);

  const response = await getSeoDataRouter().route<{
    items: Parameters<typeof mapKeywordItem>[0][];
    totalCount: number | null;
  }>(
    {
      dataType: "domain_keywords",
      domain,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      billingCustomer,
      creditFeature: metering.creditFeature,
      constraints: {
        limit: 100,
        orderBy: ["ranked_serp_element.serp_item.etv,desc"],
        includeSubdomains: true,
        projectId: input.projectId,
      },
    },
    suggestedKeywordsRouterDataSchema,
  );

  return response.data.items
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    )
    .map((item) => ({
      keyword: item.keyword,
      position: item.position,
      searchVolume: item.searchVolume,
      traffic: item.traffic,
      cpc: item.cpc,
      keywordDifficulty: item.keywordDifficulty,
    }));
}

export const DomainService = {
  getOverview,
  getSuggestedKeywords,
  getKeywordsPage,
  getPagesPage,
} as const;
