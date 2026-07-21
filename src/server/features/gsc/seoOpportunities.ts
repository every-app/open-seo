import {
  buildStrikingDistanceRows,
  type SearchPerformanceDimensionRow,
} from "@/server/features/gsc/searchPerformanceReport";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

type AuditIssueRow = {
  severity: "critical" | "warning" | "info";
  issueType: string;
  pageUrl: string;
  detailsJson: string | null;
};

type AuditPageRow = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  wordCount: number | null;
  internalLinkCount: number | null;
  crawlDepth: number | null;
  statusCode: number | null;
  fetchClass: string | null;
  isIndexable: boolean | null;
  inSitemap: boolean | null;
  responseTimeMs: number | null;
};

export type SeoOpportunity = {
  type:
    | "striking_distance"
    | "low_ctr"
    | "declining_page"
    | "technical_issue"
    | "weak_internal_links";
  priority: number;
  impact: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  source: "google_search_console" | "site_audit";
  measurement: "measured" | "inferred";
  page?: string;
  query?: string;
  title: string;
  evidence: string;
  recommendation: string;
  metrics?: Record<string, number | string | null>;
};

export type SeoOpportunitySummary = {
  total: number;
  byType: Record<string, number>;
};

export function expectedCtrForPosition(position: number): number {
  if (position <= 3) return 0.12;
  if (position <= 5) return 0.08;
  if (position <= 10) return 0.04;
  if (position <= 20) return 0.02;
  return 0.01;
}

function keyOf(row: GscSearchAnalyticsRow): string | null {
  return row.keys?.[0] ?? null;
}

function summarizeCounts(opportunities: SeoOpportunity[]): SeoOpportunitySummary {
  const byType: Record<string, number> = {};
  for (const item of opportunities) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
  }
  return { total: opportunities.length, byType };
}

function sortOpportunities(opportunities: SeoOpportunity[], limit: number) {
  return opportunities
    .toSorted((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

function buildLowCtrOpportunities(
  pageRows: GscSearchAnalyticsRow[],
): SeoOpportunity[] {
  return pageRows
    .filter((row) => (row.impressions ?? 0) >= 200 && (row.position ?? 999) <= 20)
    .map((row) => {
      const expectedCtr = expectedCtrForPosition(row.position);
      const ctrGap = expectedCtr - row.ctr;
      return { row, expectedCtr, ctrGap };
    })
    .filter(({ ctrGap }) => ctrGap >= 0.02)
    .map(({ row, expectedCtr, ctrGap }) => ({
      type: "low_ctr" as const,
      priority: Math.round(row.impressions * ctrGap * 100),
      impact: row.impressions >= 1000 ? "high" : "medium",
      confidence: "medium" as const,
      source: "google_search_console" as const,
      measurement: "measured" as const,
      page: keyOf(row) ?? undefined,
      title: "Page underperforming CTR for its current position",
      evidence: `${keyOf(row) ?? "Page"} averages ${(row.ctr * 100).toFixed(1)}% CTR at position ${row.position.toFixed(1)} across ${row.impressions} impressions; conservative baseline for this ranking band is ${(expectedCtr * 100).toFixed(1)}%.`,
      recommendation:
        "Test a sharper title and meta description aligned to the current query intent, then monitor CTR over the next comparison window.",
      metrics: {
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: Number(row.ctr.toFixed(4)),
        expected_ctr: Number(expectedCtr.toFixed(4)),
        avg_position: Number(row.position.toFixed(2)),
      },
    }));
}

function buildDecliningPageOpportunities(
  currentPageRows: GscSearchAnalyticsRow[],
  previousPageRows: GscSearchAnalyticsRow[],
): SeoOpportunity[] {
  const previousByPage = new Map<string, SearchPerformanceDimensionRow>();
  for (const row of previousPageRows) {
    const page = keyOf(row);
    if (!page) continue;
    previousByPage.set(page, {
      key: page,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }

  const opportunities: SeoOpportunity[] = [];
  for (const row of currentPageRows) {
    const page = keyOf(row);
    if (!page) continue;
    const previous = previousByPage.get(page);
    if (!previous || previous.impressions < 100) continue;
    const delta = row.impressions - previous.impressions;
    const deltaPct = previous.impressions > 0 ? delta / previous.impressions : 0;
    if (delta > -50 || deltaPct > -0.2) continue;
    opportunities.push({
      type: "declining_page",
      priority: Math.round(Math.abs(delta) * Math.max(previous.position, 1)),
      impact: Math.abs(delta) >= 300 ? "high" : "medium",
      confidence: "medium",
      source: "google_search_console",
      measurement: "measured",
      page,
      title: "Page lost impressions versus the previous period",
      evidence: `${page} dropped from ${previous.impressions} to ${row.impressions} impressions (${(deltaPct * 100).toFixed(1)}%) while average position moved from ${previous.position.toFixed(1)} to ${row.position.toFixed(1)}.`,
      recommendation:
        "Review the queries mapped to this page, recent title/content changes, and competing pages for intent drift or cannibalization.",
      metrics: {
        current_impressions: row.impressions,
        previous_impressions: previous.impressions,
        impression_delta: delta,
        impression_delta_pct: Number(deltaPct.toFixed(4)),
        current_position: Number(row.position.toFixed(2)),
        previous_position: Number(previous.position.toFixed(2)),
      },
    });
  }
  return opportunities;
}

function buildTechnicalIssueOpportunities(
  auditIssues: AuditIssueRow[],
): SeoOpportunity[] {
  return auditIssues
    .filter((row) => row.severity === "critical" || row.severity === "warning")
    .map((row) => ({
      type: "technical_issue" as const,
      priority: row.severity === "critical" ? 5000 : 2500,
      impact: row.severity === "critical" ? "high" : "medium",
      confidence: "high" as const,
      source: "site_audit" as const,
      measurement: "measured" as const,
      page: row.pageUrl,
      title: `Technical SEO issue: ${row.issueType}`,
      evidence: `${row.issueType} detected on ${row.pageUrl}.`,
      recommendation:
        "Fix the recorded technical issue on the affected page, then rerun the site audit to confirm resolution.",
    }));
}

function buildWeakInternalLinkOpportunities(
  auditPages: AuditPageRow[],
): SeoOpportunity[] {
  return auditPages
    .filter(
      (page) =>
        page.statusCode === 200 &&
        page.fetchClass === "ok" &&
        (page.internalLinkCount ?? 0) <= 1 &&
        (page.crawlDepth ?? 0) >= 3,
    )
    .map((page) => ({
      type: "weak_internal_links" as const,
      priority: 1200 + (page.crawlDepth ?? 0) * 100,
      impact: "medium" as const,
      confidence: "medium" as const,
      source: "site_audit" as const,
      measurement: "measured" as const,
      page: page.url,
      title: "Important page appears weakly linked internally",
      evidence: `${page.url} was found at crawl depth ${page.crawlDepth ?? 0} with only ${page.internalLinkCount ?? 0} internal links.`,
      recommendation:
        "Add contextual internal links from stronger hub or product pages so crawlers and users can reach this page earlier.",
      metrics: {
        internal_links: page.internalLinkCount,
        crawl_depth: page.crawlDepth,
        word_count: page.wordCount,
      },
    }));
}

export function buildSeoOpportunities(input: {
  currentQueryPageRows: GscSearchAnalyticsRow[];
  currentPageRows: GscSearchAnalyticsRow[];
  previousPageRows: GscSearchAnalyticsRow[];
  auditIssues: AuditIssueRow[];
  auditPages: AuditPageRow[];
  limit: number;
}) {
  const opportunities: SeoOpportunity[] = [];

  for (const row of buildStrikingDistanceRows(input.currentQueryPageRows, input.limit)) {
    opportunities.push({
      type: "striking_distance",
      priority: Math.round(row.impressions * (21 - row.position)),
      impact: row.impressions >= 1000 ? "high" : "medium",
      confidence: "high",
      source: "google_search_console",
      measurement: "measured",
      query: row.query,
      page: row.page,
      title: "Query is close to page one",
      evidence: `${row.query} ranks ${row.position.toFixed(1)} on ${row.page} with ${row.impressions} impressions and ${row.clicks} clicks in the selected period.`,
      recommendation:
        "Refresh the mapped page for this query, improve on-page relevance, and add internal links from adjacent pages already covering the topic.",
      metrics: {
        impressions: row.impressions,
        clicks: row.clicks,
        avg_position: Number(row.position.toFixed(2)),
      },
    });
  }

  opportunities.push(...buildLowCtrOpportunities(input.currentPageRows));
  opportunities.push(
    ...buildDecliningPageOpportunities(
      input.currentPageRows,
      input.previousPageRows,
    ),
  );
  opportunities.push(...buildTechnicalIssueOpportunities(input.auditIssues));
  opportunities.push(...buildWeakInternalLinkOpportunities(input.auditPages));

  const sorted = sortOpportunities(opportunities, input.limit);
  return {
    opportunities: sorted,
    summary: summarizeCounts(sorted),
  };
}
