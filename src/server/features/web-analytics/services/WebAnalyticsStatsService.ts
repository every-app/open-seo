// Dashboard reads: KPIs with period-over-period deltas, a zero-filled visitor
// trend, and dimension breakdowns. Query logic lives in the repository; this
// service owns range composition and response shaping.

import { AppError } from "@/server/lib/errors";
import type {
  WebAnalyticsDimension,
  WebAnalyticsPeriod,
} from "@/types/schemas/web-analytics";
import {
  bucketKeys,
  previousRange,
  resolveRange,
  type AnalyticsRange,
} from "../lib/range";
import {
  WebAnalyticsRepository,
  type BreakdownRow,
  type SessionKpis,
  type SeriesRow,
} from "../repositories/WebAnalyticsRepository";

interface WebAnalyticsKpis {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgDurationMs: number;
}

interface OverviewResponse {
  kpis: WebAnalyticsKpis;
  previous: WebAnalyticsKpis;
  online: number;
  series: Array<{ bucket: string; visitors: number; pageviews: number }>;
}

async function requireSiteId(projectId: string): Promise<string> {
  const site = await WebAnalyticsRepository.getByProjectId(projectId);
  if (!site) {
    throw new AppError("NOT_FOUND", "Web analytics is not enabled.");
  }
  return site.id;
}

function toKpis(row: SessionKpis): WebAnalyticsKpis {
  return {
    visitors: row.visitors,
    sessions: row.sessions,
    pageviews: row.pageviews,
    bounceRate: row.sessions ? row.bounces / row.sessions : 0,
    avgDurationMs: row.avgDurationMs,
  };
}

async function getOverview(
  projectId: string,
  period: WebAnalyticsPeriod,
  now = new Date(),
): Promise<OverviewResponse> {
  const siteId = await requireSiteId(projectId);
  const range = resolveRange(period, now.getTime());
  const previous = previousRange(range);

  const [currentKpis, previousKpis, online, seriesRows] = await Promise.all([
    WebAnalyticsRepository.getKpis(siteId, range.from, range.to),
    WebAnalyticsRepository.getKpis(siteId, previous.from, previous.to),
    WebAnalyticsRepository.countOnline(siteId, now.toISOString()),
    WebAnalyticsRepository.getSeries(siteId, range),
  ]);

  return {
    kpis: toKpis(currentKpis),
    previous: toKpis(previousKpis),
    online,
    series: zeroFilledSeries(seriesRows, range),
  };
}

/** Chart x-axis with no gaps: every bucket in the range, 0 when absent. */
function zeroFilledSeries(
  rows: SeriesRow[],
  range: AnalyticsRange,
): OverviewResponse["series"] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return bucketKeys(range).map((bucket) => ({
    bucket,
    visitors: byBucket.get(bucket)?.visitors ?? 0,
    pageviews: byBucket.get(bucket)?.pageviews ?? 0,
  }));
}

async function getBreakdown(
  projectId: string,
  period: WebAnalyticsPeriod,
  dimension: WebAnalyticsDimension,
  now = new Date(),
): Promise<BreakdownRow[]> {
  const siteId = await requireSiteId(projectId);
  const range = resolveRange(period, now.getTime());
  return WebAnalyticsRepository.getBreakdown(siteId, dimension, range, 100);
}

export const WebAnalyticsStatsService = {
  getOverview,
  getBreakdown,
};
