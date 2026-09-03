import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ClarityService } from "@/server/features/clarity/services/ClarityService";
import {
  privacySafeClarityUrl,
  sanitizeClarityInformation,
} from "@/server/features/clarity/services/ClarityPrivacy";
import { ClarityReportError } from "@/server/lib/clarityErrors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable, truncatedCell } from "@/server/mcp/table";
import { buildDashboardUrl } from "@/server/mcp/urls";

const reportDaysSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .optional()
  .default(3);

const MCP_MAX_TOTAL_RAW_ROWS = 50;
const MCP_MAX_TOTAL_NORMALIZED_ROWS = 50;
const MCP_MAX_STRING_LENGTH = 256;

const reportInputSchema = {
  projectId: projectIdSchema,
  numOfDays: reportDaysSchema.describe(
    "Clarity's rolling lookback in days: 1, 2, or 3. Defaults to 3.",
  ),
  limitPerMetric: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe(
      "Maximum information rows returned for each metric. Defaults to 10; maximum 50.",
    ),
} as const;

type ReportArgs = z.infer<z.ZodObject<typeof reportInputSchema>>;
type ReportResult = Awaited<ReturnType<typeof ClarityService.getReport>>;

const errorDetailSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().nullable().optional(),
    actionUrl: z.string().optional(),
  })
  .passthrough();

const normalizedFrictionMetricSchema = z.object({
  count: z.number().nullable(),
  pageViews: z.number().nullable(),
  sessions: z.number().nullable(),
  sessionsWithMetricPercent: z.number().nullable(),
  sessionsWithoutMetricPercent: z.number().nullable(),
});

const normalizedPageSchema = z.object({
  url: z.string(),
  privacyVariant: z
    .object({
      index: z.number().int().positive(),
      count: z.number().int().min(2),
    })
    .nullable(),
  traffic: z.object({
    sessions: z.number().nullable(),
    botSessions: z.number().nullable(),
    distinctUsers: z.number().nullable(),
    pagesPerSession: z.number().nullable(),
  }),
  engagement: z.object({
    averageActiveTimeSeconds: z.number().nullable(),
    averageTotalTimeSeconds: z.number().nullable(),
    activeTimePercent: z.number().nullable(),
  }),
  scrollDepthPercent: z.number().nullable(),
  friction: z.record(z.string(), normalizedFrictionMetricSchema),
});

const normalizedReportSchema = z.discriminatedUnion("kind", [
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("overview"),
      traffic: normalizedPageSchema.shape.traffic,
      engagement: normalizedPageSchema.shape.engagement,
      scrollDepthPercent: z.number().nullable(),
      friction: z.record(z.string(), normalizedFrictionMetricSchema),
      breakdowns: z.object({
        browsers: z.array(looseObjectOutputSchema),
        devices: z.array(looseObjectOutputSchema),
        operatingSystems: z.array(looseObjectOutputSchema),
        countries: z.array(looseObjectOutputSchema),
        pageTitles: z.array(looseObjectOutputSchema),
        referrers: z.array(looseObjectOutputSchema),
        popularPages: z.array(looseObjectOutputSchema),
      }),
    })
    .passthrough(),
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("url"),
      pages: z.array(normalizedPageSchema),
    })
    .passthrough(),
]);

const reportOutputSchema = z
  .object({
    status: z.enum(["ok", "error"]),
    source: looseObjectOutputSchema.optional(),
    request: looseObjectOutputSchema.optional(),
    metrics: z
      .array(
        z
          .object({
            metricName: z.string(),
            information: z.array(looseObjectOutputSchema),
          })
          .passthrough(),
      )
      .optional(),
    normalized: normalizedReportSchema.optional(),
    coverage: looseObjectOutputSchema.optional(),
    cache: looseObjectOutputSchema.optional(),
    truncation: looseObjectOutputSchema.optional(),
    warnings: z.array(z.string()).optional(),
    error: errorDetailSchema.optional(),
  })
  .passthrough();

function boundedReport(result: ReportResult, limitPerMetric: number) {
  const totalRows = result.metrics.reduce(
    (sum, metric) => sum + metric.information.length,
    0,
  );
  let rawRowsRemaining = MCP_MAX_TOTAL_RAW_ROWS;
  const metrics = result.metrics.map((metric) => {
    const rowLimit = Math.min(limitPerMetric, rawRowsRemaining);
    const information = metric.information
      .slice(0, rowLimit)
      .map((row) =>
        Object.fromEntries(
          Object.entries(
            sanitizeClarityInformation(row, metric.metricName),
          ).map(([key, value]) => [
            key,
            typeof value === "string"
              ? value.slice(0, MCP_MAX_STRING_LENGTH)
              : value,
          ]),
        ),
      );
    rawRowsRemaining -= information.length;
    return { ...metric, information };
  });
  const returnedRows = metrics.reduce(
    (sum, metric) => sum + metric.information.length,
    0,
  );
  const truncatedMetrics = result.metrics.filter(
    (metric, index) =>
      metric.information.length > (metrics[index]?.information.length ?? 0),
  ).length;
  let normalizedRowsRemaining = MCP_MAX_TOTAL_NORMALIZED_ROWS;
  const takeNormalizedRows = <Row>(rows: Row[]) => {
    const rowLimit = Math.min(limitPerMetric, normalizedRowsRemaining);
    const selected = rows.slice(0, rowLimit);
    normalizedRowsRemaining -= selected.length;
    return selected;
  };
  const normalized =
    result.normalized.kind === "url"
      ? {
          ...result.normalized,
          pages: takeNormalizedRows(result.normalized.pages).map((page) => ({
            ...page,
            url: privacySafeClarityUrl(page.url).slice(
              0,
              MCP_MAX_STRING_LENGTH,
            ),
          })),
        }
      : {
          ...result.normalized,
          breakdowns: {
            browsers: takeNormalizedRows(
              result.normalized.breakdowns.browsers,
            ).map((row) => ({
              ...row,
              label: row.label?.slice(0, MCP_MAX_STRING_LENGTH) ?? null,
            })),
            devices: takeNormalizedRows(
              result.normalized.breakdowns.devices,
            ).map((row) => ({
              ...row,
              label: row.label?.slice(0, MCP_MAX_STRING_LENGTH) ?? null,
            })),
            operatingSystems: takeNormalizedRows(
              result.normalized.breakdowns.operatingSystems,
            ).map((row) => ({
              ...row,
              label: row.label?.slice(0, MCP_MAX_STRING_LENGTH) ?? null,
            })),
            countries: takeNormalizedRows(
              result.normalized.breakdowns.countries,
            ).map((row) => ({
              ...row,
              label: row.label?.slice(0, MCP_MAX_STRING_LENGTH) ?? null,
            })),
            pageTitles: takeNormalizedRows(
              result.normalized.breakdowns.pageTitles,
            ).map((row) => ({
              ...row,
              label: row.label?.slice(0, MCP_MAX_STRING_LENGTH) ?? null,
            })),
            referrers: takeNormalizedRows(
              result.normalized.breakdowns.referrers,
            ).map((row) => ({
              ...row,
              label: row.label
                ? privacySafeClarityUrl(row.label).slice(
                    0,
                    MCP_MAX_STRING_LENGTH,
                  )
                : row.label,
            })),
            popularPages: takeNormalizedRows(
              result.normalized.breakdowns.popularPages,
            ).map((row) => ({
              ...row,
              url: privacySafeClarityUrl(row.url).slice(
                0,
                MCP_MAX_STRING_LENGTH,
              ),
            })),
          },
        };
  const totalNormalizedRows =
    result.normalized.kind === "url"
      ? result.normalized.pages.length
      : Object.values(result.normalized.breakdowns).reduce(
          (total, rows) => total + rows.length,
          0,
        );
  const returnedNormalizedRows =
    normalized.kind === "url"
      ? normalized.pages.length
      : Object.values(normalized.breakdowns).reduce(
          (total, rows) => total + rows.length,
          0,
        );
  const normalizedRowsTruncated = returnedNormalizedRows < totalNormalizedRows;
  return {
    ...result,
    metrics,
    normalized,
    truncation: {
      limitPerMetric,
      maxTotalRawRows: MCP_MAX_TOTAL_RAW_ROWS,
      maxTotalNormalizedRows: MCP_MAX_TOTAL_NORMALIZED_ROWS,
      maxStringLength: MCP_MAX_STRING_LENGTH,
      totalRows,
      returnedRows,
      truncatedMetrics,
      totalNormalizedRows,
      returnedNormalizedRows,
      normalizedRowsTruncated,
    },
    warnings:
      truncatedMetrics > 0 || normalizedRowsTruncated
        ? [...result.warnings, "information_rows_truncated"]
        : result.warnings,
  };
}

function informationSummary(row: Record<string, unknown>): string {
  const values = Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => key !== "URL" && key !== "Url" && key !== "url",
    ),
  );
  return JSON.stringify(values);
}

function reportText(label: string, report: ReturnType<typeof boundedReport>) {
  const summary = `${label}: ${report.metrics.length} metric group(s), ${report.truncation.returnedRows} of ${report.truncation.totalRows} information row(s), covering the last ${report.request.numOfDays} day(s) in UTC.${report.cache.hit ? " Served from the shared cache." : " Fetched from Clarity."}${report.cache.stale ? " The cached data is stale because Clarity was temporarily unavailable." : ""}`;
  const rows = report.metrics
    .flatMap((metric) =>
      metric.information.map((information) => ({
        metricName: metric.metricName,
        url: information.Url ?? information.URL ?? information.url,
        information,
      })),
    )
    .slice(0, 40);
  if (rows.length === 0) return summary;
  const previewNote =
    report.truncation.returnedRows > rows.length
      ? `\nText preview shows ${rows.length} rows; structuredContent contains all returned rows.`
      : "";
  return `${summary}${previewNote}\n${formatMcpTable(rows, [
    { header: "metric", value: (row) => row.metricName },
    { header: "URL", value: (row) => row.url },
    {
      header: "values",
      value: (row) => informationSummary(row.information),
      format: truncatedCell(180),
    },
  ])}`;
}

function errorResponse(
  args: ReportArgs,
  context: {
    baseUrl: string;
    auth: { organizationId: string };
    project: unknown;
  },
  error: unknown,
): CallToolResult {
  if (!(error instanceof ClarityReportError)) throw error;
  const actionUrl = [
    "clarity_not_connected",
    "clarity_reconnect_required",
  ].includes(error.code)
    ? buildDashboardUrl(
        context.baseUrl,
        `/p/${args.projectId}/settings/integrations#microsoft-clarity`,
      )
    : undefined;
  return mcpResponse({
    text: `${error.message}${actionUrl ? ` Continue here: ${actionUrl}` : ""}`,
    meta: buildProjectMeta(context, args.projectId),
    structuredContent: {
      status: "error",
      error: {
        code: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
        actionUrl,
      },
    },
  });
}

function createReportHandler(label: string, reportKind: "overview" | "url") {
  return withMcpProjectAuth(async (args: ReportArgs, context) => {
    try {
      const result = boundedReport(
        await ClarityService.getReport({
          projectId: args.projectId,
          reportKind,
          numOfDays: args.numOfDays,
        }),
        args.limitPerMetric,
      );
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

export const getMicrosoftClarityOverviewTool = {
  name: "get_microsoft_clarity_overview",
  config: {
    title: "Get Microsoft Clarity overview",
    description:
      "Read the project's connected Microsoft Clarity traffic, engagement, scroll, referrer, device, and behavioral-friction metrics for the previous 1–3 days. Data is aggregate, cached for 24 hours, read-only, and uses no OpenSEO credits.",
    inputSchema: reportInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: createReportHandler("Microsoft Clarity overview", "overview"),
};

export const getMicrosoftClarityUrlInsightsTool = {
  name: "get_microsoft_clarity_url_insights",
  config: {
    title: "Get Microsoft Clarity URL insights",
    description:
      "Read the project's Microsoft Clarity metrics broken down by URL, including engagement and friction signals such as dead, rage, quick-back, error clicks, and script errors when Clarity returns them. Covers the previous 1–3 days, is cached for 24 hours, read-only, and uses no OpenSEO credits.",
    inputSchema: reportInputSchema,
    outputSchema: reportOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: createReportHandler("Microsoft Clarity URL insights", "url"),
};
