import type { BillingCustomerContext } from "@/server/billing/subscription";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import type { BacklinksOverviewResult } from "@/server/features/backlinks/services/backlinksOverviewSchema";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { getIssueTypePageCountsForAudit } from "@/server/features/audit/repositories/auditSummaryQueries";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";

// Daily cadence: fresh numbers each visit without per-visit spend; a dormant
// project costs nothing because refreshes are visit-triggered.
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// DataForSEO's summary endpoint carries no new/lost counts, so the card's
// deltas come from diffing the latest snapshot against a previous-day
// baseline: the newest snapshot at least this much older than the latest.
// 20h rather than 24h because visit-triggered capture times drift, and a
// full-day threshold would skip yesterday's snapshot whenever today's fired
// earlier in the day.
const DELTA_BASELINE_MIN_AGE_MS = 20 * 60 * 60 * 1000;
// Overview-synced snapshots can add a few rows per day, so scan enough
// recent rows to reliably reach one from a previous day.
const DELTA_LOOKBACK_ROWS = 40;
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
  brokenBacklinks: number | null;
  /** Previous-day (or older) snapshot backing the card's delta subs; null
   *  until the project has two snapshots captured a day apart. */
  previous: {
    backlinks: number | null;
    referringDomains: number | null;
    capturedAt: string;
  } | null;
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
  const recent = await BacklinkSnapshotRepository.getRecentForProject(
    projectId,
    DELTA_LOOKBACK_ROWS,
  );
  const snapshot = recent[0];
  if (!snapshot || snapshot.domain !== domain) return null;
  // Newest row old enough to be a previous-day baseline. `recent` is newest
  // first, so the first qualifying row is the closest baseline.
  const latestMs = Date.parse(snapshot.capturedAt);
  const baseline =
    recent.find(
      (row) =>
        row.domain === domain &&
        latestMs - Date.parse(row.capturedAt) >= DELTA_BASELINE_MIN_AGE_MS,
    ) ?? null;
  return {
    domain: snapshot.domain,
    rank: snapshot.rank,
    backlinks: snapshot.backlinks,
    referringDomains: snapshot.referringDomains,
    brokenBacklinks: snapshot.brokenBacklinks,
    previous: baseline
      ? {
          backlinks: baseline.backlinks,
          referringDomains: baseline.referringDomains,
          capturedAt: baseline.capturedAt,
        }
      : null,
    capturedAt: snapshot.capturedAt,
    stale: !isSnapshotFresh(snapshot.capturedAt),
  };
}

/**
 * Visit-triggered snapshot refresh. Fetches only the DataForSEO backlinks
 * summary (not the history endpoint the backlinks page also pays for) and is
 * a no-op while the latest snapshot for the current domain is under a day
 * old. Concurrent loads racing the freshness check can each pay a metered
 * call — every call is metered, so the race duplicates customer spend on
 * identical data but never leaks revenue; accepted for now. On a fetch
 * failure with a stale snapshot in hand, the stale snapshot is returned
 * rather than surfacing an error card.
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
  const dataforseo = createDataforseoClient(input.billingCustomer);

  try {
    const summary = await dataforseo.backlinks.summary({
      target: normalized.apiTarget,
    });
    // No new/lost fields: the summary endpoint never returns them (the
    // card's deltas come from diffing consecutive snapshots instead).
    await BacklinkSnapshotRepository.insert({
      projectId,
      domain,
      rank: summary.rank ?? null,
      backlinks: summary.backlinks ?? null,
      referringDomains: summary.referring_domains ?? null,
      brokenBacklinks: summary.broken_backlinks ?? null,
      capturedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (latestMatchesDomain) {
      console.error("dashboard: backlink snapshot refresh failed", error);
      return getBacklinkSummary(projectId, domain);
    }
    throw error;
  }

  return getBacklinkSummary(projectId, domain);
}

/**
 * Opportunistic snapshot write from a Backlinks-page overview lookup: when the
 * looked-up target is the project's own domain, store the summary as a
 * dashboard snapshot so the card never lags behind numbers the user has
 * already seen. Costs no extra DataForSEO spend — the overview response is
 * reused — and a snapshot recorded here also satisfies the dashboard's daily
 * freshness check, saving that path's metered call. Cache-served overviews
 * carry their original fetchedAt, so the newer-than-latest guard drops
 * anything that would move the card backwards.
 */
async function recordBacklinkSnapshotFromOverview(input: {
  projectId: string;
  domain: string | null;
  overview: BacklinksOverviewResult;
}): Promise<void> {
  const { projectId, domain, overview } = input;
  if (!domain || overview.scope !== "domain") return;
  const normalized = normalizeBacklinksTarget(domain, { scope: "domain" });
  if (normalized.apiTarget !== overview.target) return;

  const fetchedMs = Date.parse(overview.fetchedAt);
  if (Number.isNaN(fetchedMs)) return;
  const latest = await BacklinkSnapshotRepository.getLatestForProject(projectId);
  if (
    latest &&
    latest.domain === domain &&
    Date.parse(latest.capturedAt) >= fetchedMs
  ) {
    return;
  }

  await BacklinkSnapshotRepository.insert({
    projectId,
    domain,
    rank: overview.summary.rank,
    backlinks: overview.summary.backlinks,
    referringDomains: overview.summary.referringDomains,
    brokenBacklinks: overview.summary.brokenBacklinks,
    capturedAt: overview.fetchedAt,
  });
}

export const DashboardService = {
  getActivation,
  getOverview,
  ensureBacklinkSnapshot,
  recordBacklinkSnapshotFromOverview,
};
