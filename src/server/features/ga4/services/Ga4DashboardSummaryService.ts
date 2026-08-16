import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import {
  createGa4DataClient,
  type Ga4RunReportRequest,
} from "@/server/lib/ga4Client";
import {
  Ga4MalformedResponseError,
  Ga4ReportError,
} from "@/server/lib/ga4Errors";
import { buildGa4ReportRequest } from "./Ga4ReportDefinitions";
import { COMPLETE_REPORT_LIMIT, previousPeriod } from "./Ga4ReportEnhancements";
import {
  type Ga4Quota,
  type Ga4ReportMetadata,
  type NormalizedGa4Report,
  normalizeGa4Response,
} from "./Ga4ReportNormalization";
import { mapGa4ReportError, resolveGa4DateRange } from "./Ga4ReportingService";

const DASHBOARD_METRICS = [
  "sessions",
  "keyEvents",
  "sessionKeyEventRate",
  "engagementRate",
] as const;
const LIST_FETCH_LIMIT = 10;
const LIST_RESULT_LIMIT = 3;
const CONVERSION_EVENT_RESULT_LIMIT = 5;

type DashboardMetric = (typeof DASHBOARD_METRICS)[number];
type DashboardMetricValues = Record<DashboardMetric, number | null>;
type DashboardReportContext = {
  reportMetadata: Ga4ReportMetadata;
  quota: Ga4Quota | null;
};

function reportRequest(input: {
  startDate: string;
  endDate: string;
  dimensions?: Array<"pagePath" | "city">;
  metric?: "screenPageViews" | "sessions";
}): Ga4RunReportRequest {
  const metrics = input.metric ? [input.metric] : [...DASHBOARD_METRICS];
  const dimensions = (input.dimensions ?? []).map((name) => ({ name }));
  return {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions,
    metrics: metrics.map((name) => ({ name })),
    offset: "0",
    limit: String(dimensions.length > 0 ? LIST_FETCH_LIMIT : 1),
    orderBys:
      input.metric === undefined
        ? []
        : [{ metric: { metricName: input.metric }, desc: true }],
    keepEmptyRows: false,
    returnPropertyQuota: true,
  };
}

function reportContext(report: NormalizedGa4Report): DashboardReportContext {
  return {
    reportMetadata: report.reportMetadata,
    quota: report.quota,
  };
}

function aggregateMetrics(report: NormalizedGa4Report): DashboardMetricValues {
  const row = report.rows[0];
  const restricted = new Set(
    report.reportMetadata.restrictedMetrics.map(({ metricName }) => metricName),
  );
  const value = (metric: DashboardMetric): number | null => {
    if (restricted.has(metric)) return null;
    const metricValue = row?.[metric];
    return typeof metricValue === "number" ? metricValue : 0;
  };
  return {
    sessions: value("sessions"),
    keyEvents: value("keyEvents"),
    sessionKeyEventRate: value("sessionKeyEventRate"),
    engagementRate: value("engagementRate"),
  };
}

function isUsefulDimension(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.trim().toLowerCase() !== "(not set)"
  );
}

function topPages(report: NormalizedGa4Report) {
  return report.rows
    .flatMap((row) => {
      const pagePath = row.pagePath;
      if (!isUsefulDimension(pagePath)) return [];
      return [
        {
          path: pagePath.trim(),
          views:
            typeof row.screenPageViews === "number"
              ? row.screenPageViews
              : null,
        },
      ];
    })
    .slice(0, LIST_RESULT_LIMIT);
}

function topCities(report: NormalizedGa4Report) {
  return report.rows
    .flatMap((row) => {
      const city = row.city;
      if (!isUsefulDimension(city)) return [];
      return [
        {
          city: city.trim(),
          sessions: typeof row.sessions === "number" ? row.sessions : null,
        },
      ];
    })
    .slice(0, LIST_RESULT_LIMIT);
}

function conversionEventBreakdown(report: NormalizedGa4Report) {
  const activeEvents = report.rows.flatMap((row) => {
    const eventName = row.eventName;
    if (!isUsefulDimension(eventName)) return [];
    return [
      {
        eventName: eventName.trim(),
        keyEvents: typeof row.keyEvents === "number" ? row.keyEvents : null,
        users: typeof row.totalUsers === "number" ? row.totalUsers : null,
      },
    ];
  });
  return {
    events: activeEvents.slice(0, CONVERSION_EVENT_RESULT_LIMIT),
    totalEventTypes: activeEvents.length,
  };
}

async function getDashboardGa4Summary(
  input: { projectId: string },
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

  const currentDateRange = resolveGa4DateRange(
    {},
    connection.propertyTimeZone,
    opts.now,
  ).resolvedDateRange;
  const previousDateRange = previousPeriod(currentDateRange);
  const currentRequest = reportRequest(currentDateRange);
  const previousRequest = reportRequest(previousDateRange);
  const topPagesRequest = reportRequest({
    ...currentDateRange,
    dimensions: ["pagePath"],
    metric: "screenPageViews",
  });
  const topCitiesRequest = reportRequest({
    ...currentDateRange,
    dimensions: ["city"],
    metric: "sessions",
  });
  const conversionEventsRequest = buildGa4ReportRequest({
    kind: "key_events",
    ...currentDateRange,
    channel: "all",
    breakdown: "event",
    offset: 0,
    limit: COMPLETE_REPORT_LIMIT,
  });
  const client = createGa4DataClient({
    userId: connection.connectedByUserId,
    ga4AccountId: connection.ga4AccountId,
    propertyId: connection.propertyId,
  });

  try {
    const { reports } = await client.batchRunReports([
      currentRequest,
      previousRequest,
      topPagesRequest,
      topCitiesRequest,
      conversionEventsRequest,
    ]);
    if (reports.length !== 5) throw new Ga4MalformedResponseError();
    const [
      currentResponse,
      previousResponse,
      topPagesResponse,
      topCitiesResponse,
      conversionEventsResponse,
    ] = reports;
    if (
      !currentResponse ||
      !previousResponse ||
      !topPagesResponse ||
      !topCitiesResponse ||
      !conversionEventsResponse
    ) {
      throw new Ga4MalformedResponseError();
    }
    const current = normalizeGa4Response(currentResponse, currentRequest);
    const previous = normalizeGa4Response(previousResponse, previousRequest);
    const pages = normalizeGa4Response(topPagesResponse, topPagesRequest);
    const cities = normalizeGa4Response(topCitiesResponse, topCitiesRequest);
    const conversions = normalizeGa4Response(
      conversionEventsResponse,
      conversionEventsRequest,
    );
    const currentMetrics = aggregateMetrics(current);
    const previousMetrics = aggregateMetrics(previous);
    const conversionEvents = conversionEventBreakdown(conversions);

    return {
      status: "ok" as const,
      period: {
        startDate: currentDateRange.startDate,
        endDate: currentDateRange.endDate,
        previousStartDate: previousDateRange.startDate,
        previousEndDate: previousDateRange.endDate,
      },
      property: {
        id: connection.propertyId,
        displayName: connection.propertyDisplayName,
        timeZone: connection.propertyTimeZone,
      },
      metrics: {
        visits: currentMetrics.sessions,
        conversions: currentMetrics.keyEvents,
        conversionRate: currentMetrics.sessionKeyEventRate,
        engagementRate: currentMetrics.engagementRate,
      },
      previous: {
        visits: previousMetrics.sessions,
        conversions: previousMetrics.keyEvents,
      },
      topPages: topPages(pages),
      topCities: topCities(cities).map((city) => ({
        city: city.city,
        visits: city.sessions,
      })),
      conversionEvents: conversionEvents.events,
      conversionEventTypeCount: conversionEvents.totalEventTypes,
      limitedData: {
        summary:
          current.reportMetadata.hasLimitedData ||
          previous.reportMetadata.hasLimitedData,
        pages: pages.reportMetadata.hasLimitedData,
        cities: cities.reportMetadata.hasLimitedData,
        conversions: conversions.reportMetadata.hasLimitedData,
      },
      quota: {
        current: reportContext(current),
        previous: reportContext(previous),
        pages: reportContext(pages),
        cities: reportContext(cities),
        conversions: reportContext(conversions),
      },
    };
  } catch (error) {
    mapGa4ReportError(error);
  }
}

export const Ga4DashboardSummaryService = { getDashboardGa4Summary };
export type DashboardGa4Summary = Awaited<
  ReturnType<typeof getDashboardGa4Summary>
>;
