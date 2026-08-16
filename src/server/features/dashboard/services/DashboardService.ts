import type { BillingCustomerContext } from "@/server/billing/subscription";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { getIssueTypePageCountsForAudit } from "@/server/features/audit/repositories/auditSummaryQueries";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import {
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { getSeoDataRouter } from "@/server/lib/seo-data";

// Daily cadence: fresh numbers each visit without per-visit spend; a dormant
// project costs nothing because refreshes are visit-triggered.
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Bounds the per-config result reads on the overview path; projects rarely
// have more than a couple of configs.
const MAX_CONFIGS_FOR_OVERVIEW = 5;

export type DashboardActivation = {
  domain: string | null;
  gsc: { connected: boolean; siteUrl: string | null };
  mcp: {
    authorizedAt: string | null;
    firstToolCallAt: string | null;
    cardDismissedAt: string | null;
  };
  competitorClickedAt: string | null;
};

type DashboardRankSummary = {
  trackedKeywords: number;
  improved: number;
  declined: number;
  top10: number;
  lastCheckedAt: string | null;
};

export type DashboardAuditSummary = {
  status: "running" | "completed" | "failed";
  pagesCrawled: number;
  startedAt: string;
  // Top issue types by severity then affected-page count, for the card's list.
  topIssues: {
    issueType: string;
    severity: "critical" | "warning" | "info";
    count: number;
  }[];
  totalIssueTypes: number;
};

export type DashboardBacklinkSummary = {
  domain: string;
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  capturedAt: string;
  stale: boolean;
};

type DashboardOverview = {
  rank: DashboardRankSummary | null;
  audit: DashboardAuditSummary | null;
  backlinks: DashboardBacklinkSummary | null;
};

async function getActivation(input: {
  projectId: string;
  organizationId: string;
  domain: string | null;
}): Promise<DashboardActivation> {
  const [gsc, orgActivation, projectActivation] = await Promise.all([
    GscConnectionRepository.getByProjectId(input.projectId),
    ActivationRepository.getOrganizationActivation(input.organizationId),
    ActivationRepository.getProjectActivation(input.projectId),
  ]);

  return {
    domain: input.domain,
    gsc: { connected: gsc !== null, siteUrl: gsc?.siteUrl ?? null },
    mcp: {
      authorizedAt: orgActivation?.firstMcpAuthorizedAt ?? null,
      firstToolCallAt: orgActivation?.firstMcpToolCallAt ?? null,
      cardDismissedAt: projectActivation?.mcpCardDismissedAt ?? null,
    },
    competitorClickedAt: projectActivation?.competitorStepClickedAt ?? null,
  };
}

async function getOverview(input: {
  projectId: string;
  domain: string | null;
}): Promise<DashboardOverview> {
  const [rank, audit, backlinks] = await Promise.all([
    getRankSummary(input.projectId),
    getAuditSummary(input.projectId),
    getBacklinkSummary(input.projectId, input.domain),
  ]);
  return { rank, audit, backlinks };
}

async function getRankSummary(
  projectId: string,
): Promise<DashboardRankSummary | null> {
  const configs = await RankTrackingRepository.getConfigsForProject(projectId);
  if (configs.length === 0) return null;

  const results = await Promise.all(
    configs
      .slice(0, MAX_CONFIGS_FOR_OVERVIEW)
      .map((config) => getLatestResults(config.id, projectId, "7d")),
  );

  const summary: DashboardRankSummary = {
    trackedKeywords: 0,
    improved: 0,
    declined: 0,
    top10: 0,
    lastCheckedAt: null,
  };

  for (const result of results) {
    summary.trackedKeywords += result.rows.length;
    if (
      result.run &&
      (!summary.lastCheckedAt ||
        result.run.lastCheckedAt > summary.lastCheckedAt)
    ) {
      summary.lastCheckedAt = result.run.lastCheckedAt;
    }
    for (const row of result.rows) {
      for (const device of ["desktop", "mobile"] as const) {
        const { position, previousPosition } = row[device];
        if (position !== null && position <= 10) summary.top10 += 1;
        if (position === null || previousPosition === null) continue;
        // Lower position number = better ranking.
        if (position < previousPosition) summary.improved += 1;
        else if (position > previousPosition) summary.declined += 1;
      }
    }
  }

  return summary;
}

async function getAuditSummary(
  projectId: string,
): Promise<DashboardAuditSummary | null> {
  const audit = await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) return null;

  const typeRows = await getIssueTypePageCountsForAudit(audit.id);

  const severityRank = { critical: 0, warning: 1, info: 2 };
  const sorted = typeRows
    .map((row) => ({
      issueType: row.issueType,
      severity: row.severity,
      count: row.pages,
    }))
    .toSorted(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.count - a.count,
    );

  return {
    status: audit.status,
    pagesCrawled: audit.pagesCrawled,
    startedAt: audit.startedAt,
    topIssues: sorted.slice(0, 3),
    totalIssueTypes: sorted.length,
  };
}

function isSnapshotFresh(capturedAt: string): boolean {
  const capturedMs = Date.parse(capturedAt);
  if (Number.isNaN(capturedMs)) return false;
  return Date.now() - capturedMs < SNAPSHOT_MAX_AGE_MS;
}

async function getBacklinkSummary(
  projectId: string,
  domain: string | null,
): Promise<DashboardBacklinkSummary | null> {
  if (!domain) return null;
  const snapshot =
    await BacklinkSnapshotRepository.getLatestForProject(projectId);
  if (!snapshot || snapshot.domain !== domain) return null;
  return {
    domain: snapshot.domain,
    rank: snapshot.rank,
    backlinks: snapshot.backlinks,
    referringDomains: snapshot.referringDomains,
    newBacklinks: snapshot.newBacklinks,
    lostBacklinks: snapshot.lostBacklinks,
    newReferringDomains: snapshot.newReferringDomains,
    lostReferringDomains: snapshot.lostReferringDomains,
    capturedAt: snapshot.capturedAt,
    stale: !isSnapshotFresh(snapshot.capturedAt),
  };
}

/**
 * Backlink summary payload as returned by the router: the DataForSEO provider
 * yields snake_case fields (with DataForSEO's `reffering` typo fallbacks), the
 * internal provider yields camelCase rows. Both are mapped into the fields the
 * snapshot repository insert expects.
 */
type BacklinkSummaryItem = {
  rank?: number | null;
  backlinks?: number | null;
  referring_domains?: number | null;
  referringDomains?: number | null;
  broken_backlinks?: number | null;
  brokenBacklinks?: number | null;
  new_backlinks?: number | null;
  newBacklinks?: number | null;
  lost_backlinks?: number | null;
  lostBacklinks?: number | null;
  new_referring_domains?: number | null;
  new_reffering_domains?: number | null;
  newReferringDomains?: number | null;
  lost_referring_domains?: number | null;
  lost_reffering_domains?: number | null;
  lostReferringDomains?: number | null;
};

function toSummaryFields(
  item: BacklinkSummaryItem,
): Omit<
  Parameters<typeof BacklinkSnapshotRepository.insert>[0],
  "projectId" | "domain" | "capturedAt"
> {
  return {
    rank: item.rank ?? null,
    backlinks: item.backlinks ?? null,
    referringDomains:
      item.referringDomains ?? item.referring_domains ?? null,
    brokenBacklinks: item.brokenBacklinks ?? item.broken_backlinks ?? null,
    newBacklinks: item.newBacklinks ?? item.new_backlinks ?? null,
    lostBacklinks: item.lostBacklinks ?? item.lost_backlinks ?? null,
    newReferringDomains:
      item.newReferringDomains ??
      item.new_referring_domains ??
      item.new_reffering_domains ??
      null,
    lostReferringDomains:
      item.lostReferringDomains ??
      item.lost_referring_domains ??
      item.lost_reffering_domains ??
      null,
  };
}

/**
 * Visit-triggered snapshot refresh. Fetches the backlinks summary through the
 * seo data router (R2 cache → internal snapshot → DataForSEO), and is a no-op
 * while the latest snapshot for the current domain is under a day old.
 * Concurrent loads racing the freshness check coalesce on the router's
 * single-flight, so identical data is paid for at most once per cache TTL. On
 * a fetch failure with a stale snapshot in hand, the stale snapshot is
 * returned rather than surfacing an error card.
 *
 * The snapshot row's capturedAt is only bumped by a genuine DataForSEO fetch
 * (or a first-ever fetch served from the shared cache), so the dashboard's
 * stale badge reflects the real capture age — cached refreshes never fake a
 * fresh capture.
 */
async function ensureBacklinkSnapshot(input: {
  projectId: string;
  domain: string | null;
  billingCustomer: BillingCustomerContext;
}): Promise<DashboardBacklinkSummary | null> {
  const { projectId, domain } = input;
  if (!domain) return null;

  const latest =
    await BacklinkSnapshotRepository.getLatestForProject(projectId);
  const latestMatchesDomain = latest !== null && latest.domain === domain;
  if (latest && latestMatchesDomain && isSnapshotFresh(latest.capturedAt)) {
    return getBacklinkSummary(projectId, domain);
  }

  const normalized = normalizeBacklinksTarget(domain, { scope: "domain" });

  try {
    const { data, provider } = await getSeoDataRouter().route<BacklinkSummaryItem>({
      dataType: "backlinks",
      domain: normalized.apiTarget,
      billingCustomer: input.billingCustomer,
      creditFeature: "backlinks",
      constraints: { projectId, backlinkCall: "summary" },
    });
    if (provider === "dataforseo" || latest === null) {
      await BacklinkSnapshotRepository.insert({
        projectId,
        domain,
        ...toSummaryFields(data),
        capturedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    if (latestMatchesDomain) {
      console.error("dashboard: backlink snapshot refresh failed", error);
      return getBacklinkSummary(projectId, domain);
    }
    throw error;
  }

  return getBacklinkSummary(projectId, domain);
}

export const DashboardService = {
  getActivation,
  getOverview,
  ensureBacklinkSnapshot,
};
