import {
  type Ga4RunReportRequest,
  type Ga4RunReportResponse,
} from "@/server/lib/ga4Client";
import { Ga4MalformedResponseError } from "@/server/lib/ga4Errors";

type Ga4QuotaStatus = { consumed: number; remaining: number };
export type Ga4Quota = {
  tokensPerDay?: Ga4QuotaStatus;
  tokensPerHour?: Ga4QuotaStatus;
  concurrentRequests?: Ga4QuotaStatus;
  serverErrorsPerProjectPerHour?: Ga4QuotaStatus;
  potentiallyThresholdedRequestsPerHour?: Ga4QuotaStatus;
  tokensPerProjectPerHour?: Ga4QuotaStatus;
};

export type Ga4ReportMetadata = {
  dataLossFromOtherRow: boolean;
  subjectToThresholding: boolean;
  sampling: Array<{
    samplesReadCount: string;
    samplingSpaceSize: string;
  }>;
  restrictedMetrics: Array<{
    metricName: string;
    restrictedMetricTypes: string[];
  }>;
  emptyReason: string | null;
  hasLimitedData: boolean;
};

export type NormalizedGa4Report = {
  rows: Array<Record<string, string | number | null>>;
  totalRowCount: number;
  reportMetadata: Ga4ReportMetadata;
  quota: Ga4Quota | null;
};

function parseFiniteMetric(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Ga4MalformedResponseError();
  return parsed;
}

export function normalizeGa4Response(
  response: Ga4RunReportResponse,
  request: Ga4RunReportRequest,
): NormalizedGa4Report {
  const expectedDimensions = request.dimensions.map(({ name }) => name);
  const expectedMetrics = request.metrics.map(({ name }) => name);
  const dimensions = (response.dimensionHeaders ?? []).map(({ name }) => name);
  const metrics = (response.metricHeaders ?? []).map(({ name }) => name);

  // GA4 omits headers and rows entirely (rather than echoing the requested
  // headers with zero rows) when the date range has no data on record for
  // the property at all — e.g. a previous-period comparison window that
  // falls before the property's creation date. Treat that as a
  // legitimately empty report instead of a malformed response.
  const isHeaderlessEmptyResponse =
    response.dimensionHeaders === undefined &&
    response.metricHeaders === undefined &&
    (response.rows?.length ?? 0) === 0;

  if (
    !isHeaderlessEmptyResponse &&
    (dimensions.join("\0") !== expectedDimensions.join("\0") ||
      metrics.join("\0") !== expectedMetrics.join("\0"))
  ) {
    throw new Ga4MalformedResponseError();
  }

  const restrictedMetrics =
    response.metadata?.schemaRestrictionResponse?.activeMetricRestrictions?.map(
      (restriction) => ({
        metricName: restriction.metricName,
        restrictedMetricTypes: restriction.restrictedMetricTypes ?? [],
      }),
    ) ?? [];
  const restrictedNames = new Set(
    restrictedMetrics.map((restriction) => restriction.metricName),
  );
  const rows = (response.rows ?? []).map((row) => {
    if (
      (row.dimensionValues?.length ?? 0) !== dimensions.length ||
      (row.metricValues?.length ?? 0) !== metrics.length
    ) {
      throw new Ga4MalformedResponseError();
    }
    const normalized: Record<string, string | number | null> = {};
    dimensions.forEach((name, index) => {
      normalized[name] = row.dimensionValues?.[index]?.value ?? "";
    });
    metrics.forEach((name, index) => {
      normalized[name] = restrictedNames.has(name)
        ? null
        : parseFiniteMetric(row.metricValues?.[index]?.value ?? "");
    });
    return normalized;
  });
  const sampling = response.metadata?.samplingMetadatas ?? [];
  const reportMetadata = {
    dataLossFromOtherRow: response.metadata?.dataLossFromOtherRow ?? false,
    subjectToThresholding: response.metadata?.subjectToThresholding ?? false,
    sampling,
    restrictedMetrics,
    emptyReason: response.metadata?.emptyReason ?? null,
    hasLimitedData:
      (response.metadata?.dataLossFromOtherRow ?? false) ||
      (response.metadata?.subjectToThresholding ?? false) ||
      sampling.length > 0 ||
      restrictedMetrics.length > 0,
  };
  return {
    rows,
    totalRowCount: response.rowCount ?? rows.length,
    reportMetadata,
    quota: response.propertyQuota ?? null,
  };
}
