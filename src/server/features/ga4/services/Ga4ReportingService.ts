import { z } from "zod";
import { createGa4DataClient } from "@/server/lib/ga4Client";
import {
  Ga4AdminApiError,
  Ga4DataApiError,
  Ga4MalformedResponseError,
  Ga4ReportError,
  Ga4TokenError,
} from "@/server/lib/ga4Errors";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import {
  buildGa4ReportRequest,
  getGa4ReportConfiguration,
  type Ga4Channel,
  type Ga4ReportKind,
} from "./Ga4ReportDefinitions";
import {
  buildReportComparison,
  buildReportSpecificEnhancements,
  COMPLETE_REPORT_LIMIT,
  needsCompleteReport,
  previousPeriod,
  supportsComparison,
} from "./Ga4ReportEnhancements";
import { normalizeGa4Response } from "./Ga4ReportNormalization";
import { ga4DateInTimeZone, shiftGa4Date } from "./Ga4Dates";

export type Ga4ReportInput = {
  projectId: string;
  kind: Ga4ReportKind;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  channel?: Ga4Channel;
  includeDate?: boolean;
  breakdown?: "event" | "event_and_landing_page";
  acquisitionBreakdown?: "channel_group" | "source_medium" | "campaign";
  ecommerceBreakdown?: "item" | "landing_page";
  ecommerceOnlyWithTransactions?: boolean;
  audienceBreakdown?: "device" | "country" | "new_vs_returning";
  comparePreviousPeriod?: boolean;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1_000;

function parseDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function resolveGa4DateRange(
  input: Pick<Ga4ReportInput, "startDate" | "endDate">,
  propertyTimeZone: string,
  now: Date = new Date(),
) {
  if (Boolean(input.startDate) !== Boolean(input.endDate)) {
    throw new Ga4ReportError(
      "validation_error",
      "Provide both startDate and endDate, or neither.",
    );
  }
  const requestedDateRange =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : null;
  if (
    requestedDateRange &&
    (!parseDate(requestedDateRange.startDate) ||
      !parseDate(requestedDateRange.endDate) ||
      requestedDateRange.startDate > requestedDateRange.endDate)
  ) {
    throw new Ga4ReportError(
      "validation_error",
      "Dates must be valid YYYY-MM-DD values with startDate on or before endDate.",
    );
  }

  const lastCompleteDay = shiftGa4Date(
    ga4DateInTimeZone(now, propertyTimeZone),
    -1,
  );
  let endDate = requestedDateRange?.endDate ?? lastCompleteDay;
  let startDate = requestedDateRange?.startDate ?? shiftGa4Date(endDate, -27);
  const warnings: string[] = [];
  if (endDate > lastCompleteDay) {
    endDate = lastCompleteDay;
    warnings.push("end_date_clamped");
  }
  const ninetyDayFloor = shiftGa4Date(endDate, -89);
  if (startDate < ninetyDayFloor) {
    startDate = ninetyDayFloor;
    warnings.push("start_date_clamped");
  }
  if (startDate > endDate) {
    throw new Ga4ReportError(
      "validation_error",
      "The resolved startDate is after the last complete Analytics day.",
    );
  }
  return {
    requestedDateRange,
    resolvedDateRange: { startDate, endDate },
    warnings,
  };
}

function normalizeLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Ga4ReportError(
      "validation_error",
      `limit must be an integer from 1 to ${MAX_LIMIT}.`,
    );
  }
  return limit;
}

function normalizeOffset(value: number | undefined): number {
  const offset = value ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Ga4ReportError(
      "validation_error",
      "offset must be a non-negative integer.",
    );
  }
  return offset;
}

export function mapGa4ReportError(error: unknown): never {
  if (error instanceof Ga4ReportError) throw error;
  if (error instanceof Ga4TokenError) {
    throw new Ga4ReportError(
      "ga4_reconnect_required",
      "The Google Analytics connection has expired or was revoked.",
    );
  }
  if (error instanceof Ga4MalformedResponseError) {
    throw new Ga4ReportError(
      "ga4_malformed_response",
      "Google Analytics returned an invalid report.",
    );
  }
  if (error instanceof Ga4DataApiError && error.status === 400) {
    throw new Ga4ReportError(
      "ga4_report_incompatible",
      "This report is not compatible with the selected Analytics property.",
    );
  }
  if (error instanceof Ga4DataApiError || error instanceof Ga4AdminApiError) {
    if (error.status === 401) {
      throw new Ga4ReportError(
        "ga4_reconnect_required",
        "The Google Analytics connection has expired or was revoked.",
      );
    }
    if (error.status === 403) {
      if (
        error instanceof Ga4DataApiError &&
        error.upstreamReason === "SERVICE_DISABLED"
      ) {
        throw new Ga4ReportError(
          "ga4_upstream_unavailable",
          "The Google Analytics Data API is not enabled for this OAuth application.",
        );
      }
      throw new Ga4ReportError(
        "ga4_property_inaccessible",
        "The connected Google account can no longer access this property.",
      );
    }
    if (error.status === 404) {
      throw new Ga4ReportError(
        "ga4_property_inaccessible",
        "The selected Google Analytics property is no longer available.",
      );
    }
    if (error.status === 429) {
      throw new Ga4ReportError(
        "ga4_quota_exhausted",
        "Google Analytics reporting quota is exhausted. Try again later.",
        error instanceof Ga4DataApiError ? error.retryAfterSeconds : null,
      );
    }
    throw new Ga4ReportError(
      "ga4_upstream_unavailable",
      "Google Analytics reporting is temporarily unavailable.",
    );
  }
  if (error instanceof z.ZodError) {
    throw new Ga4ReportError(
      "ga4_malformed_response",
      "Google Analytics returned an invalid report.",
    );
  }
  throw error;
}

async function resolveReportPage(input: {
  client: ReturnType<typeof createGa4DataClient>;
  normalized: ReturnType<typeof normalizeGa4Response>;
  request: Parameters<ReturnType<typeof createGa4DataClient>["runReport"]>[0];
  fetchCompleteReport: boolean;
  offset: number;
  limit: number;
}) {
  const { client, normalized, request, fetchCompleteReport, offset, limit } =
    input;
  const requestedPageIsBuffered =
    normalized.totalRowCount <= normalized.rows.length ||
    offset + limit <= normalized.rows.length;
  let rows = fetchCompleteReport
    ? normalized.rows.slice(offset, offset + limit)
    : normalized.rows;

  if (fetchCompleteReport && !requestedPageIsBuffered) {
    const pageRequest = {
      ...request,
      offset: String(offset),
      limit: String(limit),
    };
    const pageResponse = await client.runReport(pageRequest);
    rows = normalizeGa4Response(pageResponse, pageRequest).rows;
  }

  const rowCount = rows.length;
  if (rowCount === 0 && offset < normalized.totalRowCount) {
    throw new Ga4MalformedResponseError();
  }
  const nextOffset = offset + rowCount;
  return {
    rows,
    rowCount,
    hasMore: nextOffset < normalized.totalRowCount,
    nextOffset,
  };
}

async function runReport(input: Ga4ReportInput, opts: { now?: Date } = {}) {
  const connection = await Ga4ConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new Ga4ReportError(
      "ga4_not_connected",
      "Google Analytics is not connected for this project.",
    );
  }
  const limit = normalizeLimit(input.limit);
  const offset = normalizeOffset(input.offset);
  const channel = input.channel ?? "organic_search";
  const dateRange = resolveGa4DateRange(
    input,
    connection.propertyTimeZone,
    opts.now,
  );
  if (input.comparePreviousPeriod && !supportsComparison(input)) {
    throw new Ga4ReportError(
      "validation_error",
      "Previous-period comparison is only available for event key events, channel-group acquisition, device audiences, and new-versus-returning audiences.",
    );
  }
  const fetchCompleteReport = needsCompleteReport(input);
  const reportConfiguration = getGa4ReportConfiguration({
    ...input,
    ...dateRange.resolvedDateRange,
    channel,
    limit,
    offset,
  });
  const request = buildGa4ReportRequest({
    ...input,
    ...dateRange.resolvedDateRange,
    channel,
    limit: fetchCompleteReport ? COMPLETE_REPORT_LIMIT : limit,
    offset: fetchCompleteReport ? 0 : offset,
  });

  try {
    const client = createGa4DataClient({
      userId: connection.connectedByUserId,
      ga4AccountId: connection.ga4AccountId,
      propertyId: connection.propertyId,
    });
    const previousDateRange = input.comparePreviousPeriod
      ? previousPeriod(dateRange.resolvedDateRange)
      : null;
    const previousRequest = previousDateRange
      ? buildGa4ReportRequest({
          ...input,
          ...previousDateRange,
          channel,
          limit: COMPLETE_REPORT_LIMIT,
          offset: 0,
        })
      : null;
    const [response, previousResponse] = await Promise.all([
      client.runReport(request),
      previousRequest ? client.runReport(previousRequest) : null,
    ]);
    const normalized = normalizeGa4Response(response, request);
    const previousNormalized =
      previousResponse && previousRequest
        ? normalizeGa4Response(previousResponse, previousRequest)
        : null;
    const { rows, rowCount, hasMore, nextOffset } = await resolveReportPage({
      client,
      normalized,
      request,
      fetchCompleteReport,
      offset,
      limit,
    });
    const comparison =
      previousNormalized && previousDateRange
        ? buildReportComparison({
            current: normalized,
            previous: previousNormalized,
            previousDateRange,
            dimensions: reportConfiguration.dimensions,
            metrics: reportConfiguration.metrics,
          })
        : undefined;
    const comparisonIncomplete = comparison && !comparison.coverage.complete;
    const enhancements = buildReportSpecificEnhancements(
      normalized,
      input,
      dateRange.resolvedDateRange,
    );
    return {
      status: "ok",
      source: {
        provider: "google_analytics",
        propertyId: connection.propertyId,
        propertyDisplayName: connection.propertyDisplayName,
      },
      request: {
        requestedDateRange: dateRange.requestedDateRange,
        resolvedDateRange: dateRange.resolvedDateRange,
        propertyTimeZone: connection.propertyTimeZone,
        currencyCode: connection.propertyCurrencyCode,
        channel,
        ...reportConfiguration,
        limit,
        offset,
      },
      rowCount,
      totalRowCount: normalized.totalRowCount,
      rows,
      pageInfo: {
        offset,
        limit,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
      },
      reportMetadata: normalized.reportMetadata,
      quota: normalized.quota,
      warnings: [
        ...dateRange.warnings,
        ...(comparisonIncomplete ? ["comparison_incomplete"] : []),
      ],
      ...enhancements,
      comparison,
    };
  } catch (error) {
    mapGa4ReportError(error);
  }
}

export const Ga4ReportingService = { runReport };
export type Ga4ReportResult = Awaited<ReturnType<typeof runReport>>;
