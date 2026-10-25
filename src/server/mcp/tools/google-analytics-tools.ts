/* eslint-disable max-lines -- all GA4 MCP tools are intentionally kept in one module */
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Ga4MeasurementHealthService } from "@/server/features/ga4/services/Ga4MeasurementHealthService";
import { OVERVIEW_METRICS } from "@/server/features/ga4/services/Ga4ReportDefinitions";
import { Ga4OrganicOverviewService } from "@/server/features/ga4/services/Ga4OrganicOverviewService";
import {
  GSC_API_DISABLED_MESSAGE,
  GscApiError,
  GscNotConnectedError,
  GscTokenError,
} from "@/server/lib/gscErrors";
import {
  Ga4ReportingService,
  type Ga4ReportInput,
  type Ga4ReportResult,
} from "@/server/features/ga4/services/Ga4ReportingService";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { SearchOpportunityService } from "@/server/features/ga4/services/SearchOpportunityService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  formatMcpCell,
  formatMcpTable,
  percentCell,
  positionCell,
  readPath,
  truncatedCell,
  type McpTableColumn,
} from "@/server/mcp/table";
import { buildDashboardUrl } from "@/server/mcp/urls";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Inclusive YYYY-MM-DD date. Provide both startDate and endDate.");

const commonAnalyticsInputSchema = {
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.number().int().min(1).max(1_000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
} as const;

const errorDetailSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().nullable().optional(),
    actionUrl: z.string().optional(),
  })
  .passthrough();

// The MCP SDK can only publish and validate a top-level object schema — a
// discriminated union normalizes to undefined, which drops the schema from
// tools/list and crashes output validation. So the ok/error branches share
// one object, with the per-status required fields enforced by a refinement.
// The Umami tools return the same envelope.
export function analyticsEnvelopeSchema(okShape: Record<string, z.ZodType>) {
  const requiredOkFields = Object.entries(okShape)
    .filter(([, field]) => !field.safeParse(undefined).success)
    .map(([key]) => key);
  const optionalShape = Object.fromEntries(
    Object.entries(okShape).map(([key, field]) => [key, field.optional()]),
  );
  return z
    .object({
      status: z.enum(["ok", "error"]),
      ...optionalShape,
      error: errorDetailSchema.optional(),
    })
    .passthrough()
    .superRefine((value, ctx) => {
      if (value.status === "error") {
        if (value.error === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["error"],
            message: "error is required when status is error",
          });
        }
        return;
      }
      for (const key of requiredOkFields) {
        if ((value as Record<string, unknown>)[key] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when status is ok`,
          });
        }
      }
    });
}

const reportOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  rowCount: z.number(),
  totalRowCount: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
  pageInfo: looseObjectOutputSchema,
  reportMetadata: looseObjectOutputSchema,
  warnings: z.array(z.string()),
  quota: looseObjectOutputSchema.nullable().optional(),
  comparison: looseObjectOutputSchema.optional(),
  ecommerceActivity: looseObjectOutputSchema.optional(),
  siteSearchActivity: looseObjectOutputSchema.optional(),
  diagnostics: z.array(looseObjectOutputSchema).optional(),
  diagnosticCoverage: looseObjectOutputSchema.optional(),
});

const overviewOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  current: looseObjectOutputSchema.nullable(),
  previous: looseObjectOutputSchema.nullable(),
  comparison: looseObjectOutputSchema,
  trend: z.array(z.record(z.string(), z.unknown())),
  diagnostics: z.array(looseObjectOutputSchema),
  reportMetadata: looseObjectOutputSchema,
  warnings: z.array(z.string()),
  quota: looseObjectOutputSchema.nullable().optional(),
});

const measurementHealthOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  summary: looseObjectOutputSchema,
  issues: z.array(z.string()),
  webStreams: z.array(z.record(z.string(), z.unknown())),
  otherStreams: z.array(z.record(z.string(), z.unknown())),
  keyEvents: z.array(z.record(z.string(), z.unknown())),
  customDefinitions: looseObjectOutputSchema,
});

const opportunityOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  rowCount: z.number(),
  totalCandidateRows: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
  scoring: looseObjectOutputSchema,
  coverage: looseObjectOutputSchema,
  truncated: looseObjectOutputSchema,
  warnings: z.array(z.string()),
  reportMetadata: looseObjectOutputSchema,
  quota: looseObjectOutputSchema.nullable().optional(),
});

type ProjectContext = {
  auth: { organizationId: string };
  baseUrl: string;
  project: unknown;
};

type ProjectArgs = { projectId: string };

function actionUrl(
  baseUrl: string,
  projectId: string,
  code: string,
): string | undefined {
  if (code.startsWith("ga4_")) {
    if (
      [
        "ga4_not_connected",
        "ga4_reconnect_required",
        "ga4_property_inaccessible",
      ].includes(code)
    ) {
      return buildDashboardUrl(
        baseUrl,
        `/p/${projectId}/settings/integrations`,
      );
    }
    return undefined;
  }
  if (code.startsWith("gsc_")) {
    return buildDashboardUrl(baseUrl, `/p/${projectId}/search-performance`);
  }
  return undefined;
}

function errorResponse(
  args: ProjectArgs,
  context: ProjectContext,
  error: unknown,
): CallToolResult {
  let code: string;
  let message: string;
  let retryAfterSeconds: number | null | undefined;
  if (error instanceof Ga4ReportError) {
    code = error.code;
    message = error.message;
    retryAfterSeconds = error.retryAfterSeconds;
  } else if (error instanceof GscNotConnectedError) {
    code = "gsc_not_connected";
    message = "Search Console is not connected for this project.";
  } else if (error instanceof GscApiError && error.apiDisabled) {
    code = "gsc_api_disabled";
    message = GSC_API_DISABLED_MESSAGE;
  } else if (
    error instanceof GscTokenError ||
    (error instanceof GscApiError && [401, 403].includes(error.status))
  ) {
    code = "gsc_reconnect_required";
    message = "The Search Console connection has expired or was revoked.";
  } else if (error instanceof GscApiError) {
    code = "gsc_upstream_unavailable";
    message = "Search Console reporting is temporarily unavailable.";
  } else {
    throw error;
  }
  const url = actionUrl(context.baseUrl, args.projectId, code);
  return mcpResponse({
    text: `${message}${url ? ` Continue here: ${url}` : ""}`,
    meta: buildProjectMeta(context, args.projectId),
    structuredContent: {
      status: "error",
      error: {
        code,
        message,
        retryAfterSeconds,
        actionUrl: url,
      },
    },
  });
}

type Ga4ReportRow = Ga4ReportResult["rows"][number];
type Ga4ComparisonRow = NonNullable<
  Ga4ReportResult["comparison"]
>["rows"][number];
type Ga4OverviewResult = Awaited<
  ReturnType<typeof Ga4OrganicOverviewService.getOrganicOverview>
>;
type Ga4TrendRow = Ga4OverviewResult["trend"][number];
type Ga4MeasurementHealthResult = Awaited<
  ReturnType<typeof Ga4MeasurementHealthService.getMeasurementHealth>
>;
type SearchOpportunityResult = Awaited<
  ReturnType<typeof SearchOpportunityService.getOpportunities>
>;
type SearchOpportunityRow = SearchOpportunityResult["rows"][number];

// Comparison rows come from a complete (unpaginated) report, so cap what the
// text block renders. Rows arrive in current-report order, which GA4 sorts by
// the report's order metric, so the first rows are the largest ones.
const COMPARISON_ROW_LIMIT = 50;

/** Leading newline so callers can concatenate sections directly. */
function section<T>(
  label: string,
  rows: readonly T[],
  columns: readonly McpTableColumn<T>[],
): string {
  if (rows.length === 0) return "";
  return `\n${label}:\n${formatMcpTable(rows, columns)}`;
}

// Diagnostics are built per report kind, so their element type is a union of
// record shapes; read the shared fields by path.
function diagnosticsSection(diagnostics: readonly unknown[]): string {
  return section("Diagnostics", diagnostics, [
    { header: "severity", value: (row) => readPath(row, "severity") },
    { header: "code", value: (row) => readPath(row, "code") },
    { header: "message", value: (row) => readPath(row, "message") },
    {
      header: "evidence",
      value: (row) => readPath(row, "evidence"),
      format: truncatedCell(160),
    },
  ]);
}

function deltaCell(value: unknown): string {
  const current = formatMcpCell(readPath(value, "current"));
  const previous = formatMcpCell(readPath(value, "previous"));
  const percent = readPath(value, "percentChange");
  const change =
    typeof percent === "number" && Number.isFinite(percent)
      ? ` (${percent > 0 ? "+" : ""}${percentCell(percent)})`
      : "";
  return `${current} vs ${previous}${change}`;
}

function comparisonSection(comparison: Ga4ReportResult["comparison"]): string {
  if (!comparison) return "";
  // A requested comparison that came back empty must still be distinguishable
  // from one that was never requested.
  if (comparison.rows.length === 0) {
    return "\nPrevious-period comparison returned no rows.";
  }
  const rows = comparison.rows.slice(0, COMPARISON_ROW_LIMIT);
  const truncated =
    comparison.rows.length > rows.length
      ? `, top ${rows.length} of ${comparison.rows.length} rows`
      : "";
  const range = comparison.previousDateRange;
  const columns: McpTableColumn<Ga4ComparisonRow>[] = [
    ...comparison.dimensions.map(
      (dimension): McpTableColumn<Ga4ComparisonRow> => ({
        header: dimension,
        value: (row) => row.dimensions[dimension],
      }),
    ),
    ...comparison.metrics.map(
      (metric): McpTableColumn<Ga4ComparisonRow> => ({
        header: metric,
        value: (row) => row.metrics[metric],
        format: deltaCell,
      }),
    ),
  ];
  return section(
    `Compared with ${range.startDate} through ${range.endDate} (current vs previous${truncated})`,
    rows,
    columns,
  );
}

// These four MCP tools accept channel=all. landing_pages is Organic Search
// only and has no channel argument.
const CHANNEL_SELECTABLE_REPORTS = new Set<
  Ga4ReportResult["request"]["reportKind"]
>([
  "page_performance",
  "key_events",
  "ecommerce_performance",
  "audience_breakdown",
]);

function reportTableColumns(
  result: Ga4ReportResult,
): McpTableColumn<Ga4ReportRow>[] {
  return [...result.request.dimensions, ...result.request.metrics].map(
    (key) => ({
      header: key,
      value: (row) => row[key],
    }),
  );
}

function emptyOrganicHint(result: Ga4ReportResult): string {
  if (
    result.totalRowCount !== 0 ||
    result.request.channel !== "organic_search"
  ) {
    return "";
  }
  return CHANNEL_SELECTABLE_REPORTS.has(result.request.reportKind)
    ? " This report is filtered to Organic Search. Pass channel=all to include every channel."
    : " This report is limited to Organic Search.";
}

function endDateClampNote(result: {
  warnings: string[];
  request: { resolvedDateRange: { endDate: string } };
}) {
  return result.warnings.includes("end_date_clamped")
    ? ` The requested endDate was moved back to ${result.request.resolvedDateRange.endDate}, the last complete Analytics day.`
    : "";
}

function reportText(label: string, result: Ga4ReportResult) {
  const range = result.request.resolvedDateRange;
  const limited = result.reportMetadata.hasLimitedData
    ? " Google marked this report as limited; inspect reportMetadata."
    : "";
  const paginate = result.pageInfo.hasMore
    ? " More rows are available; call again with offset to page through them."
    : "";
  const summary = `${label}: ${result.rowCount} of ${result.totalRowCount} rows for ${range.startDate} through ${range.endDate}.${endDateClampNote(result)}${limited}${emptyOrganicHint(result)}${paginate}`;
  const rows =
    result.rows.length === 0
      ? ""
      : `\n${formatMcpTable(result.rows, reportTableColumns(result))}`;
  // Rows stay adjacent to the summary line that counts them; the labelled
  // sections follow so neither table can be mistaken for the other.
  return `${summary}${rows}${diagnosticsSection(result.diagnostics)}${comparisonSection(result.comparison)}`;
}

function trendSection(result: Ga4OverviewResult): string {
  const weekly = result.request.trend === "weekly";
  const dimension = weekly ? "yearWeek" : "date";
  const columns: McpTableColumn<Ga4TrendRow>[] = [
    { header: dimension, value: (row) => row[dimension] },
    ...OVERVIEW_METRICS.map(
      (metric): McpTableColumn<Ga4TrendRow> => ({
        header: metric,
        value: (row) => row[metric],
      }),
    ),
  ];
  return section(
    weekly ? "Weekly trend" : "Daily trend",
    result.trend,
    columns,
  );
}

function overviewText(result: Ga4OverviewResult) {
  const range = result.request.resolvedDateRange;
  const previousRange = result.request.previousDateRange;
  const trendTruncated = result.warnings.includes("trend_truncated")
    ? ` The trend was cut at ${result.trend.length} rows; use trend=weekly or a shorter date range for the full series.`
    : "";
  const summary = `Organic overview for ${range.startDate} through ${range.endDate}, compared with ${previousRange.startDate} through ${previousRange.endDate}.${endDateClampNote(result)}${trendTruncated}`;
  if (!result.current) {
    return `${summary} No Organic Search rows for this date range.`;
  }
  const rows = OVERVIEW_METRICS.map((metric) => ({
    metric,
    current: result.current[metric] ?? null,
    previous: result.previous?.[metric] ?? null,
  }));
  const totals = formatMcpTable(rows, [
    { header: "metric", value: (row) => row.metric },
    { header: "current", value: (row) => row.current },
    { header: "previous", value: (row) => row.previous },
  ]);
  return `${summary}\n${totals}${diagnosticsSection(result.diagnostics)}${trendSection(result)}`;
}

const OPPORTUNITY_COLUMNS: McpTableColumn<SearchOpportunityRow>[] = [
  { header: "score", value: (row) => row.score },
  { header: "page", value: (row) => row.page },
  { header: "position", value: (row) => row.position, format: positionCell },
  { header: "impressions", value: (row) => row.impressions },
  { header: "clicks", value: (row) => row.clicks },
  { header: "CTR", value: (row) => row.ctr, format: percentCell },
  { header: "sessions", value: (row) => row.ga4?.sessions },
  { header: "keyEvents", value: (row) => row.ga4?.keyEvents },
  { header: "engagementRate", value: (row) => row.ga4?.engagementRate },
  { header: "match", value: (row) => row.joinStatus },
];

function opportunityText(result: SearchOpportunityResult) {
  const range = result.request.dateRange;
  const summary = `Search opportunities for ${range.startDate} through ${range.endDate}: ${result.rowCount} returned from ${result.totalCandidateRows} candidates. ${result.coverage.matchedRows} candidates matched GA4 landing pages.`;
  if (result.rows.length === 0) return summary;
  return `${summary}\n${formatMcpTable(result.rows, OPPORTUNITY_COLUMNS)}`;
}

function measurementHealthText(result: Ga4MeasurementHealthResult) {
  const summary = `Measurement health: ${result.summary.webStreamCount} web stream(s), ${result.summary.keyEventCount} key event(s), and ${result.summary.issueCount} diagnostic issue(s).`;
  const issues =
    result.issues.length > 0 ? ` Issues: ${result.issues.join(", ")}.` : "";
  return [
    `${summary}${issues}`,
    section("Web streams", result.webStreams, [
      { header: "streamId", value: (row) => row.streamId },
      { header: "displayName", value: (row) => row.displayName },
      { header: "measurementId", value: (row) => row.measurementId },
      { header: "defaultUri", value: (row) => row.defaultUri },
      {
        header: "enhancedMeasurement",
        value: (row) => row.enhancedMeasurement.streamEnabled,
      },
      {
        header: "siteSearch",
        value: (row) => row.enhancedMeasurement.siteSearchEnabled,
      },
    ]),
    section("Other streams", result.otherStreams, [
      { header: "streamId", value: (row) => row.streamId },
      { header: "type", value: (row) => row.type },
      { header: "displayName", value: (row) => row.displayName },
    ]),
    section("Key events", result.keyEvents, [
      { header: "eventName", value: (row) => row.eventName },
      { header: "countingMethod", value: (row) => row.countingMethod },
      { header: "custom", value: (row) => row.custom ?? false },
    ]),
    section("Custom dimensions", result.customDefinitions.dimensions, [
      { header: "parameterName", value: (row) => row.parameterName },
      { header: "displayName", value: (row) => row.displayName },
      { header: "scope", value: (row) => row.scope },
    ]),
    section("Custom metrics", result.customDefinitions.metrics, [
      { header: "parameterName", value: (row) => row.parameterName },
      { header: "displayName", value: (row) => row.displayName },
      { header: "scope", value: (row) => row.scope },
      { header: "measurementUnit", value: (row) => row.measurementUnit },
    ]),
  ].join("");
}

function createAnalyticsReportHandler<TArgs extends ProjectArgs>(
  label: string,
  toInput: (args: TArgs) => Ga4ReportInput,
) {
  return withMcpProjectAuth(async (args: TArgs, context) => {
    try {
      const result = await Ga4ReportingService.runReport(toInput(args));
      return mcpResponse({
        text: reportText(label, result),
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  });
}

const landingPageInputSchema = z.strictObject(commonAnalyticsInputSchema);
type LandingPageArgs = z.infer<typeof landingPageInputSchema>;

export const getGoogleAnalyticsOrganicLandingPagesTool = {
  name: "get_google_analytics_organic_landing_pages",
  config: {
    title: "Get Google Analytics organic landing pages",
    description:
      "Read organic-search landing page sessions, engagement, key events, transactions, and revenue from the project's connected GA4 property. Defaults to the last 28 complete property days. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: landingPageInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<LandingPageArgs>(
    "Organic landing pages",
    (args) => ({
      ...args,
      kind: "landing_pages",
      channel: "organic_search",
    }),
  ),
};

const pagePerformanceInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  includeDate: z.boolean().optional().default(false),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
});
type PagePerformanceArgs = z.infer<typeof pagePerformanceInputSchema>;

export const getGoogleAnalyticsPagePerformanceTool = {
  name: "get_google_analytics_page_performance",
  config: {
    title: "Get Google Analytics page performance",
    description:
      "Read page views, users, engagement duration, and key events from the connected GA4 property. Organic Search is the default; set channel to all to include every channel. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: pagePerformanceInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<PagePerformanceArgs>(
    "Page performance",
    (args) => ({
      ...args,
      kind: "page_performance",
    }),
  ),
};

const keyEventsInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z
    .enum(["event", "event_and_landing_page"])
    .optional()
    .default("event"),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
  comparePreviousPeriod: z.boolean().optional().default(false),
});
type KeyEventsArgs = z.infer<typeof keyEventsInputSchema>;

export const getGoogleAnalyticsKeyEventsTool = {
  name: "get_google_analytics_key_events",
  config: {
    title: "Get Google Analytics key events",
    description:
      "Read active GA4 key events with counts and users by event or organic landing page. Previous-period comparison is available for the event breakdown. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: keyEventsInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<KeyEventsArgs>(
    "Key events",
    (args) => ({
      ...args,
      kind: "key_events",
    }),
  ),
};

const opportunityInputSchema = z.strictObject({
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
type OpportunityArgs = z.infer<typeof opportunityInputSchema>;

export const getSearchOpportunitiesTool = {
  name: "get_search_opportunities",
  config: {
    title: "Get search opportunities",
    description:
      "Join Search Console pages ranking in positions 4–20 with GA4 organic landing-page outcomes, then score matched opportunities by demand, business value, and reachability. Unmatched pages remain visible and unscored. Reads only the Search Console and GA4 properties already connected to an OpenSEO project the caller is authorized to access. The server selects the Google accounts and properties from that project's saved connections. Read-only and uses no OpenSEO credits.",
    inputSchema: opportunityInputSchema,
    outputSchema: opportunityOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: OpportunityArgs, context) => {
    try {
      const result = await SearchOpportunityService.getOpportunities(args);
      return mcpResponse({
        text: opportunityText(result),
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};

const overviewInputSchema = z.strictObject({
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  trend: z.enum(["daily", "weekly"]).optional().default("daily"),
});
type OverviewArgs = z.infer<typeof overviewInputSchema>;

export const getGoogleAnalyticsOrganicOverviewTool = {
  name: "get_google_analytics_organic_overview",
  config: {
    title: "Get Google Analytics organic overview",
    description:
      "Answer whether organic traffic is improving with top-line sessions, users, engagement, key events, transactions, revenue, an equal-length previous-period comparison, and a daily or weekly trend. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: overviewInputSchema,
    outputSchema: overviewOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: OverviewArgs, context) => {
    try {
      const result = await Ga4OrganicOverviewService.getOrganicOverview(args);
      return mcpResponse({
        text: overviewText(result),
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};

const trafficAcquisitionInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z
    .enum(["channel_group", "source_medium", "campaign"])
    .optional()
    .default("channel_group"),
  comparePreviousPeriod: z.boolean().optional().default(false),
});
type TrafficAcquisitionArgs = z.infer<typeof trafficAcquisitionInputSchema>;

export const getGoogleAnalyticsTrafficAcquisitionTool = {
  name: "get_google_analytics_traffic_acquisition",
  config: {
    title: "Get Google Analytics traffic acquisition",
    description:
      "Compare session acquisition by channel group, source/medium, or campaign, including sessions, users, engagement, key events, transactions, and revenue. Previous-period comparison is available for channel group; source/medium also reports attribution-quality diagnostics. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: trafficAcquisitionInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<TrafficAcquisitionArgs>(
    "Traffic acquisition",
    (args) => ({
      ...args,
      kind: "traffic_acquisition",
      channel: "all",
      acquisitionBreakdown: args.breakdown,
      breakdown: undefined,
    }),
  ),
};

const ecommerceInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z.enum(["item", "landing_page"]).optional().default("item"),
  onlyWithTransactions: z.boolean().optional().default(false),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
});
type EcommerceArgs = z.infer<typeof ecommerceInputSchema>;

export const getGoogleAnalyticsEcommercePerformanceTool = {
  name: "get_google_analytics_ecommerce_performance",
  config: {
    title: "Get Google Analytics ecommerce performance",
    description:
      "Read item views, add-to-cart units, purchases, and item revenue by item, or transactions and purchase revenue by landing page. Returns a detected, none, or unknown activity state; landing pages can be limited to those with transactions. Organic Search is the default. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: ecommerceInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<EcommerceArgs>(
    "Ecommerce performance",
    (args) => ({
      ...args,
      kind: "ecommerce_performance",
      ecommerceBreakdown: args.breakdown,
      ecommerceOnlyWithTransactions: args.onlyWithTransactions,
      breakdown: undefined,
    }),
  ),
};

const siteSearchInputSchema = z.strictObject(commonAnalyticsInputSchema);
type SiteSearchArgs = z.infer<typeof siteSearchInputSchema>;

export const getGoogleAnalyticsSiteSearchTool = {
  name: "get_google_analytics_site_search",
  config: {
    title: "Get Google Analytics site search",
    description:
      "Read measured internal search terms with search events, users, sessions, engaged sessions, and engagement rate. Requires GA4 site-search measurement. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: siteSearchInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<SiteSearchArgs>(
    "Site search",
    (args) => ({
      ...args,
      kind: "site_search",
      channel: "all",
    }),
  ),
};

const audienceInputSchema = z.strictObject({
  ...commonAnalyticsInputSchema,
  breakdown: z
    .enum(["device", "country", "new_vs_returning"])
    .optional()
    .default("device"),
  channel: z
    .enum(["organic_search", "all"])
    .optional()
    .default("organic_search"),
  comparePreviousPeriod: z.boolean().optional().default(false),
});
type AudienceArgs = z.infer<typeof audienceInputSchema>;

export const getGoogleAnalyticsAudienceBreakdownTool = {
  name: "get_google_analytics_audience_breakdown",
  config: {
    title: "Get Google Analytics audience breakdown",
    description:
      "Read device, country, or new-versus-returning users, sessions, engagement, and key events. Previous-period comparison is available for device and new-versus-returning breakdowns. No demographic or user-level dimensions. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: audienceInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: createAnalyticsReportHandler<AudienceArgs>(
    "Audience breakdown",
    (args) => ({
      ...args,
      kind: "audience_breakdown",
      audienceBreakdown: args.breakdown,
      breakdown: undefined,
    }),
  ),
};

const measurementHealthInputSchema = z.strictObject({
  projectId: projectIdSchema,
});
type MeasurementHealthArgs = z.infer<typeof measurementHealthInputSchema>;

export const getGoogleAnalyticsMeasurementHealthTool = {
  name: "get_google_analytics_measurement_health",
  config: {
    title: "Get Google Analytics measurement health",
    description:
      "Diagnose the connected property's data streams, web measurement IDs, enhanced-measurement settings, key events, and custom definitions. Reads only the GA4 property already connected to an OpenSEO project the caller is authorized to access. The server selects the Google account and property from that project's saved connection. Read-only and uses no OpenSEO credits.",
    inputSchema: measurementHealthInputSchema,
    outputSchema: measurementHealthOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: MeasurementHealthArgs, context) => {
    try {
      const result = await Ga4MeasurementHealthService.getMeasurementHealth(
        args.projectId,
      );
      return mcpResponse({
        text: measurementHealthText(result),
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: result,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};
