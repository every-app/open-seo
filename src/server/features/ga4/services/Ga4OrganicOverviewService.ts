import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { createGa4DataClient } from "@/server/lib/ga4Client";
import {
  buildGa4OverviewRequest,
  OVERVIEW_METRICS,
} from "./Ga4ReportDefinitions";
import { normalizeGa4Response } from "./Ga4ReportNormalization";
import { comparisonValue, previousPeriod } from "./Ga4ReportEnhancements";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { mapGa4ReportError, resolveGa4DateRange } from "./Ga4ReportingService";

type Ga4OrganicOverviewInput = {
  projectId: string;
  startDate?: string;
  endDate?: string;
  trend?: "daily" | "weekly";
};

function metricComparison(
  current: Record<string, string | number | null> | null,
  previous: Record<string, string | number | null> | null,
) {
  return Object.fromEntries(
    OVERVIEW_METRICS.map((metric) => {
      const currentValue =
        typeof current?.[metric] === "number" ? current[metric] : null;
      const previousValue =
        typeof previous?.[metric] === "number" ? previous[metric] : null;
      return [metric, comparisonValue(currentValue, previousValue)];
    }),
  );
}

function keyEventDiagnostics(
  current: Record<string, string | number | null> | null,
  previous: Record<string, string | number | null> | null,
  hasLimitedData: boolean,
) {
  if (hasLimitedData) return [];
  const currentValue =
    typeof current?.keyEvents === "number" ? current.keyEvents : null;
  const previousValue =
    typeof previous?.keyEvents === "number" ? previous.keyEvents : null;
  if (currentValue == null || previousValue == null || previousValue < 5) {
    return [];
  }
  const percentChange = (currentValue - previousValue) / previousValue;
  if (percentChange > -0.5) return [];
  return [
    {
      code: "key_events_sharp_decline",
      severity: "warning",
      message:
        "Organic key events declined sharply compared with the previous equal-length period.",
      evidence: {
        current: currentValue,
        previous: previousValue,
        percentChange,
      },
      threshold: { minimumPreviousKeyEvents: 5, percentChange: -0.5 },
    },
  ];
}

async function getOrganicOverview(
  input: Ga4OrganicOverviewInput,
  opts: { now?: Date } = {},
) {
  const connection = await Ga4ConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new Ga4ReportError(
      "ga4_not_connected",
      "Google Analytics is not connected for this project.",
    );
  }
  const dateRange = resolveGa4DateRange(
    input,
    connection.propertyTimeZone,
    opts.now,
  );
  const previousDateRange = previousPeriod(dateRange.resolvedDateRange);
  const currentRequest = buildGa4OverviewRequest(dateRange.resolvedDateRange);
  const previousRequest = buildGa4OverviewRequest({
    ...previousDateRange,
  });
  const trend = input.trend ?? "daily";
  const trendRequest = buildGa4OverviewRequest({
    ...dateRange.resolvedDateRange,
    trend,
  });
  const client = createGa4DataClient({
    userId: connection.connectedByUserId,
    ga4AccountId: connection.ga4AccountId,
    propertyId: connection.propertyId,
  });

  try {
    const [currentResponse, previousResponse, trendResponse] =
      await Promise.all([
        client.runReport(currentRequest),
        client.runReport(previousRequest),
        client.runReport(trendRequest),
      ]);
    const current = normalizeGa4Response(currentResponse, currentRequest);
    const previous = normalizeGa4Response(previousResponse, previousRequest);
    const trendReport = normalizeGa4Response(trendResponse, trendRequest);
    const currentSummary = current.rows[0] ?? null;
    const previousSummary = previous.rows[0] ?? null;
    const reports = [current, previous, trendReport];
    const hasLimitedData = reports.some(
      (report) => report.reportMetadata.hasLimitedData,
    );
    return {
      status: "ok" as const,
      source: {
        provider: "google_analytics" as const,
        propertyId: connection.propertyId,
        propertyDisplayName: connection.propertyDisplayName,
      },
      request: {
        requestedDateRange: dateRange.requestedDateRange,
        resolvedDateRange: dateRange.resolvedDateRange,
        previousDateRange,
        propertyTimeZone: connection.propertyTimeZone,
        currencyCode: connection.propertyCurrencyCode,
        channel: "organic_search" as const,
        trend,
      },
      current: currentSummary,
      previous: previousSummary,
      comparison: metricComparison(currentSummary, previousSummary),
      trend: trendReport.rows,
      diagnostics: keyEventDiagnostics(
        currentSummary,
        previousSummary,
        hasLimitedData,
      ),
      reportMetadata: {
        hasLimitedData,
        reports: reports.map((report) => report.reportMetadata),
      },
      quota: trendReport.quota ?? current.quota,
      warnings: dateRange.warnings,
    };
  } catch (error) {
    mapGa4ReportError(error);
  }
}

export const Ga4OrganicOverviewService = { getOrganicOverview };
