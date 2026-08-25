import type { CreditFeature } from "@/shared/billing-credit-features";
import type {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { buildBacklinksScopeFilter } from "@/server/lib/dataforseo/researchScopeFilters";
import type { BacklinksOverviewResult } from "@/server/features/backlinks/services/backlinksOverviewSchema";

/**
 * The summary and history endpoints only take a whole target, so subfolder
 * totals come from two filtered `total_count` reads of the backlinks list:
 * every link (`as_is`) and one per referring domain. Rank, spam scores,
 * new/lost, and trends have no filtered source and stay null/empty.
 * Sequenced, not parallel: hosted billing checks balance per call.
 */
export async function buildSubfolderOverview(
  dataforseo: ReturnType<typeof createDataforseoClient>,
  normalizedTarget: ReturnType<typeof normalizeBacklinksTarget>,
  now: Date,
  creditFeature?: CreditFeature,
): Promise<BacklinksOverviewResult> {
  const filters = buildBacklinksScopeFilter("url_to", normalizedTarget).clauses;

  const allLinks = await dataforseo.backlinks.rows({
    target: normalizedTarget.apiTarget,
    includeSubdomains: normalizedTarget.includeSubdomains,
    limit: 1,
    mode: "as_is",
    filters,
    creditFeature,
  });
  const perDomain = await dataforseo.backlinks.rows({
    target: normalizedTarget.apiTarget,
    includeSubdomains: normalizedTarget.includeSubdomains,
    limit: 1,
    mode: "one_per_domain",
    filters,
    creditFeature,
  });

  return {
    target: normalizedTarget.apiTarget,
    displayTarget: normalizedTarget.displayTarget,
    scope: "subfolder",
    summary: {
      rank: null,
      backlinks: allLinks.totalCount,
      referringPages: null,
      referringDomains: perDomain.totalCount,
      brokenBacklinks: null,
      brokenPages: null,
      backlinksSpamScore: null,
      targetSpamScore: null,
      newBacklinks: null,
      lostBacklinks: null,
      newReferringDomains: null,
      lostReferringDomains: null,
    },
    trends: [],
    newLostTrends: [],
    fetchedAt: now.toISOString(),
  };
}
