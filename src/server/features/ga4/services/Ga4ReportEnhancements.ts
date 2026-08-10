import type { Ga4ReportInput } from "./Ga4ReportingService";
import type { NormalizedGa4Report } from "./Ga4ReportNormalization";
import { inclusiveGa4Days, shiftGa4Date } from "./Ga4Dates";

export const COMPLETE_REPORT_LIMIT = 1_000;

type DateRange = { startDate: string; endDate: string };
type ReportRow = Record<string, string | number | null>;

export function previousPeriod(range: DateRange): DateRange {
  const days = inclusiveGa4Days(range.startDate, range.endDate);
  const endDate = shiftGa4Date(range.startDate, -1);
  return { startDate: shiftGa4Date(endDate, -(days - 1)), endDate };
}

export function supportsComparison(input: Ga4ReportInput): boolean {
  if (input.kind === "key_events") {
    return (input.breakdown ?? "event") === "event";
  }
  if (input.kind === "traffic_acquisition") {
    return (input.acquisitionBreakdown ?? "channel_group") === "channel_group";
  }
  if (input.kind === "audience_breakdown") {
    return ["device", "new_vs_returning"].includes(
      input.audienceBreakdown ?? "device",
    );
  }
  return false;
}

export function needsCompleteReport(input: Ga4ReportInput): boolean {
  return (
    input.comparePreviousPeriod === true ||
    (input.kind === "traffic_acquisition" &&
      input.acquisitionBreakdown === "source_medium") ||
    input.kind === "ecommerce_performance" ||
    input.kind === "site_search"
  );
}

function metricValue(
  row: ReportRow | undefined,
  metric: string,
): number | null {
  const value = row?.[metric];
  return typeof value === "number" ? value : null;
}

export function comparisonValue(
  current: number | null,
  previous: number | null,
) {
  const absoluteChange =
    current != null && previous != null ? current - previous : null;
  return {
    current,
    previous,
    absoluteChange,
    percentChange:
      absoluteChange != null && previous != null && previous !== 0
        ? absoluteChange / previous
        : null,
  };
}

function rowKey(row: ReportRow, dimensions: string[]): string {
  return JSON.stringify(dimensions.map((dimension) => row[dimension] ?? null));
}

export function buildReportComparison(input: {
  current: NormalizedGa4Report;
  previous: NormalizedGa4Report;
  previousDateRange: DateRange;
  dimensions: string[];
  metrics: string[];
}) {
  const currentByKey = new Map(
    input.current.rows.map((row) => [rowKey(row, input.dimensions), row]),
  );
  const previousByKey = new Map(
    input.previous.rows.map((row) => [rowKey(row, input.dimensions), row]),
  );
  const keys = [
    ...currentByKey.keys(),
    ...[...previousByKey.keys()].filter((key) => !currentByKey.has(key)),
  ];
  const currentComplete =
    input.current.rows.length === input.current.totalRowCount;
  const previousComplete =
    input.previous.rows.length === input.previous.totalRowCount;
  return {
    previousDateRange: input.previousDateRange,
    dimensions: input.dimensions,
    metrics: input.metrics,
    rows: keys.map((key) => {
      const current = currentByKey.get(key);
      const previous = previousByKey.get(key);
      return {
        dimensions: Object.fromEntries(
          input.dimensions.map((dimension) => [
            dimension,
            current?.[dimension] ?? previous?.[dimension] ?? null,
          ]),
        ),
        metrics: Object.fromEntries(
          input.metrics.map((metric) => [
            metric,
            comparisonValue(
              metricValue(current, metric),
              metricValue(previous, metric),
            ),
          ]),
        ),
      };
    }),
    coverage: {
      complete: currentComplete && previousComplete,
      current: {
        fetchedRowCount: input.current.rows.length,
        totalRowCount: input.current.totalRowCount,
      },
      previous: {
        fetchedRowCount: input.previous.rows.length,
        totalRowCount: input.previous.totalRowCount,
      },
    },
    reportMetadata: {
      hasLimitedData:
        input.current.reportMetadata.hasLimitedData ||
        input.previous.reportMetadata.hasLimitedData,
      current: input.current.reportMetadata,
      previous: input.previous.reportMetadata,
    },
    quota: input.previous.quota,
  };
}

function isInternalHost(value: string): boolean {
  const source = value.split(" / ")[0]?.toLowerCase() ?? "";
  const withoutProtocol = source.replace(/^https?:\/\//, "");
  if (withoutProtocol === "::1" || withoutProtocol.startsWith("[::1]")) {
    return true;
  }
  const host = withoutProtocol.split(":")[0] ?? "";
  if (host === "localhost" || host.startsWith("127.")) {
    return true;
  }
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function buildAttributionDiagnostics(report: NormalizedGa4Report) {
  const complete = report.rows.length === report.totalRowCount;
  const coverage = {
    complete,
    limitedData: report.reportMetadata.hasLimitedData,
    fetchedRowCount: report.rows.length,
    totalRowCount: report.totalRowCount,
  };
  if (!complete || report.reportMetadata.hasLimitedData) {
    return { diagnostics: [], diagnosticCoverage: coverage };
  }
  const diagnostics: Array<Record<string, unknown>> = [];
  const sessions = report.rows.reduce(
    (sum, row) => sum + (metricValue(row, "sessions") ?? 0),
    0,
  );
  const notSetSessions = report.rows
    .filter((row) => row.sessionSourceMedium === "(not set)")
    .reduce((sum, row) => sum + (metricValue(row, "sessions") ?? 0), 0);
  const notSetShare = sessions > 0 ? notSetSessions / sessions : 0;
  if (notSetShare >= 0.05) {
    diagnostics.push({
      code: "attribution_not_set_share_high",
      severity: "warning",
      message: "A notable share of sessions has no source/medium attribution.",
      evidence: {
        sessions: notSetSessions,
        totalSessions: sessions,
        share: notSetShare,
      },
      threshold: { share: 0.05 },
    });
  }
  const internalRows = report.rows.filter(
    (row) =>
      typeof row.sessionSourceMedium === "string" &&
      isInternalHost(row.sessionSourceMedium),
  );
  const internalSessions = internalRows.reduce(
    (sum, row) => sum + (metricValue(row, "sessions") ?? 0),
    0,
  );
  if (internalSessions > 0) {
    diagnostics.push({
      code: "internal_referral_traffic_detected",
      severity: "warning",
      message:
        "Local or private-network referral sources appear in acquisition data.",
      evidence: {
        sessions: internalSessions,
        sources: internalRows.map((row) => row.sessionSourceMedium),
      },
      threshold: { sessions: 0 },
    });
  }
  const caseGroups = new Map<string, Set<string>>();
  for (const row of report.rows) {
    if (typeof row.sessionSourceMedium !== "string") continue;
    const key = row.sessionSourceMedium.toLowerCase();
    const variants = caseGroups.get(key) ?? new Set<string>();
    variants.add(row.sessionSourceMedium);
    caseGroups.set(key, variants);
  }
  const variantGroups = [...caseGroups.values()]
    .filter((variants) => variants.size > 1)
    .map((variants) => [...variants]);
  if (variantGroups.length > 0) {
    diagnostics.push({
      code: "source_medium_case_variants_detected",
      severity: "info",
      message: "Source/medium values differ only by letter casing.",
      evidence: { variantGroups },
      threshold: { variantGroups: 0 },
    });
  }
  return { diagnostics, diagnosticCoverage: coverage };
}

function activityStatus(
  report: NormalizedGa4Report,
  detected: boolean,
): "detected" | "none" | "unknown" {
  if (
    report.reportMetadata.hasLimitedData ||
    report.rows.length !== report.totalRowCount
  ) {
    return "unknown";
  }
  return detected ? "detected" : "none";
}

export function buildEcommerceActivity(
  report: NormalizedGa4Report,
  input: Ga4ReportInput,
  dateRange: DateRange,
) {
  const breakdown = input.ecommerceBreakdown ?? "item";
  const metrics =
    breakdown === "item"
      ? ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"]
      : ["transactions", "purchaseRevenue"];
  const totals = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      report.rows.reduce(
        (sum, row) => sum + (metricValue(row, metric) ?? 0),
        0,
      ),
    ]),
  );
  const detected = Object.values(totals).some((value) => value > 0);
  const status = activityStatus(report, detected);
  return {
    status,
    dateRange,
    channel: input.channel ?? "organic_search",
    breakdown,
    evidence: totals,
    reason:
      status === "none"
        ? "No matching ecommerce activity was reported for this period and channel."
        : status === "unknown"
          ? "The fetched report is incomplete or limited, so ecommerce activity cannot be determined."
          : null,
  };
}

export function buildSiteSearchActivity(
  report: NormalizedGa4Report,
  dateRange: DateRange,
) {
  const eventCount = report.rows.reduce(
    (sum, row) => sum + (metricValue(row, "eventCount") ?? 0),
    0,
  );
  const status = activityStatus(report, eventCount > 0);
  return {
    status,
    dateRange,
    searchTermCount: report.totalRowCount,
    searchEventCount: eventCount,
    reason:
      status === "none"
        ? "No measured site-search terms were reported for this period."
        : status === "unknown"
          ? "The fetched report is incomplete or limited, so site-search activity cannot be determined."
          : null,
  };
}

export function buildReportSpecificEnhancements(
  report: NormalizedGa4Report,
  input: Ga4ReportInput,
  dateRange: DateRange,
) {
  if (
    input.kind === "traffic_acquisition" &&
    input.acquisitionBreakdown === "source_medium"
  ) {
    return buildAttributionDiagnostics(report);
  }
  if (input.kind === "ecommerce_performance") {
    const ecommerceActivity = buildEcommerceActivity(report, input, dateRange);
    return {
      diagnostics:
        ecommerceActivity.status === "none"
          ? [
              {
                code: "no_ecommerce_activity",
                severity: "info",
                message: ecommerceActivity.reason,
                evidence: ecommerceActivity.evidence,
                threshold: { matchingActivity: 0 },
              },
            ]
          : [],
      ecommerceActivity,
    };
  }
  if (input.kind === "site_search") {
    const siteSearchActivity = buildSiteSearchActivity(report, dateRange);
    return {
      diagnostics:
        siteSearchActivity.status === "none"
          ? [
              {
                code: "no_site_search_activity",
                severity: "info",
                message: siteSearchActivity.reason,
                evidence: {
                  searchTermCount: siteSearchActivity.searchTermCount,
                  searchEventCount: siteSearchActivity.searchEventCount,
                },
                threshold: { searchEvents: 0 },
              },
            ]
          : [],
      siteSearchActivity,
    };
  }
  return { diagnostics: [] };
}
