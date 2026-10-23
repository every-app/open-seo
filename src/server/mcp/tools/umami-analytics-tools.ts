import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  UmamiReportingService,
  type UmamiOverviewResult,
  type UmamiReportInput,
  type UmamiReportResult,
} from "@/server/features/umami/services/UmamiReportingService";
import { UmamiError } from "@/server/lib/umamiErrors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable, percentCell } from "@/server/mcp/table";
import { analyticsEnvelopeSchema } from "@/server/mcp/tools/google-analytics-tools";
import { buildDashboardUrl } from "@/server/mcp/urls";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Inclusive YYYY-MM-DD date. Provide both startDate and endDate.");

const channelSchema = z
  .enum(["organic_search", "all"])
  .optional()
  .default("organic_search")
  .describe(
    "organic_search keeps visits whose referrer is a search engine (Google, Bing, DuckDuckGo, and others). all includes every visit.",
  );

const commonInputSchema = {
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.number().int().min(1).max(1_000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
} as const;

const reportOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  rowCount: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
  pageInfo: looseObjectOutputSchema,
  warnings: z.array(z.string()),
});

const overviewOutputSchema = analyticsEnvelopeSchema({
  source: looseObjectOutputSchema,
  request: looseObjectOutputSchema,
  current: looseObjectOutputSchema,
  previous: looseObjectOutputSchema,
  comparison: looseObjectOutputSchema,
  trend: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()),
});

const SCOPE_NOTE =
  "Reads only the Umami website already connected to an OpenSEO project the caller is authorized to access. The server selects the Umami server and website from that project's saved connection. Read-only and uses no OpenSEO credits.";

type ProjectArgs = { projectId: string };
type ProjectContext = {
  auth: { organizationId: string };
  baseUrl: string;
  project: unknown;
};

// Codes the user fixes in project settings rather than by retrying.
const SETTINGS_CODES = new Set([
  "umami_not_connected",
  "umami_auth_failed",
  "umami_two_factor_required",
  "umami_website_inaccessible",
  "umami_unsupported_version",
  "umami_url_blocked",
]);

function errorResponse(
  args: ProjectArgs,
  context: ProjectContext,
  error: unknown,
): CallToolResult {
  if (!(error instanceof UmamiError)) throw error;
  const url = SETTINGS_CODES.has(error.code)
    ? buildDashboardUrl(
        context.baseUrl,
        `/p/${args.projectId}/settings/integrations`,
      )
    : undefined;
  return mcpResponse({
    text: `${error.message}${url ? ` Continue here: ${url}` : ""}`,
    meta: buildProjectMeta(context, args.projectId),
    structuredContent: {
      status: "error",
      error: { code: error.code, message: error.message, actionUrl: url },
    },
  });
}

function rangeNote(result: {
  warnings: string[];
  request: { resolvedDateRange: { endDate: string } };
}) {
  return result.warnings.includes("end_date_clamped")
    ? ` The requested endDate was moved back to ${result.request.resolvedDateRange.endDate}, the last complete day.`
    : "";
}

// Totals use Umami's own Organic search channel; per-row reports and the
// trend can only filter on the visit's referrer, so the two can differ.
function channelNote(channel: string, scope: "overview" | "rows") {
  if (channel !== "organic_search") return "";
  return scope === "overview"
    ? " Totals are Umami's Organic search channel; the trend counts visitors referred by a search engine. Pass channel=all for every visit."
    : " Filtered to visits referred by a search engine; pass channel=all for every visit.";
}

function reportText(label: string, result: UmamiReportResult) {
  const range = result.request.resolvedDateRange;
  const paginate = result.pageInfo.hasMore
    ? " More rows are available; call again with offset to page through them."
    : "";
  const summary = `${label} (Umami: ${result.source.websiteName}): ${result.rowCount} rows for ${range.startDate} through ${range.endDate}.${rangeNote(result)}${channelNote(result.request.channel, "rows")}${paginate}`;
  if (result.rows.length === 0) return summary;
  const columns = [...result.request.dimensions, ...result.request.metrics].map(
    (key) => ({
      header: key,
      value: (row: Record<string, unknown>) => row[key],
    }),
  );
  return `${summary}\n${formatMcpTable(result.rows, columns)}`;
}

function overviewText(result: UmamiOverviewResult) {
  const range = result.request.resolvedDateRange;
  const previous = result.request.previousDateRange;
  const summary = `Umami overview for ${result.source.websiteName}, ${range.startDate} through ${range.endDate}, compared with ${previous.startDate} through ${previous.endDate}.${rangeNote(result)}${channelNote(result.request.channel, "overview")}`;
  // bounceRate is a 0-1 ratio; the counts render as-is.
  const cell = (metric: string, value: number | null) =>
    metric === "bounceRate" && value !== null ? percentCell(value) : value;
  const totals = formatMcpTable(
    (["visits", "visitors", "pageviews", "bounceRate"] as const).map(
      (metric) => ({
        metric,
        current: cell(metric, result.current[metric]),
        previous: cell(metric, result.previous[metric]),
      }),
    ),
    [
      { header: "metric", value: (row) => row.metric },
      { header: "current", value: (row) => row.current },
      { header: "previous", value: (row) => row.previous },
    ],
  );
  const trend = formatMcpTable(result.trend, [
    { header: "date", value: (row) => row.date },
    { header: "visitors", value: (row) => row.visitors },
    { header: "pageviews", value: (row) => row.pageviews },
  ]);
  const trendLabel =
    result.request.trend === "daily" ? "Daily trend" : "Monthly trend";
  const pageviewsNote =
    result.request.channel === "organic_search"
      ? " (organic trend counts visitors; pageviews are in the totals)"
      : "";
  return `${summary}\n${totals}\n${trendLabel}${pageviewsNote}:\n${trend}`;
}

function createReportHandler<TArgs extends ProjectArgs>(
  label: string,
  toInput: (args: TArgs) => UmamiReportInput,
) {
  return withMcpProjectAuth(async (args: TArgs, context) => {
    try {
      const result = await UmamiReportingService.runReport(toInput(args));
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

const annotations = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

const overviewInputSchema = z.strictObject({
  projectId: projectIdSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  channel: channelSchema,
});
type OverviewArgs = z.infer<typeof overviewInputSchema>;

export const getUmamiOrganicOverviewTool = {
  name: "get_umami_organic_overview",
  config: {
    title: "Get Umami organic overview",
    description: `Answer whether organic traffic is improving from the project's connected Umami website: visits, visitors, pageviews, bounce rate, and average visit duration, an equal-length previous-period comparison, and a daily visitors trend (monthly for ranges over 180 days). Defaults to the last 28 complete days. ${SCOPE_NOTE}`,
    inputSchema: overviewInputSchema,
    outputSchema: overviewOutputSchema,
    annotations,
  },
  handler: withMcpProjectAuth(async (args: OverviewArgs, context) => {
    try {
      const result = await UmamiReportingService.getOverview(args);
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

const landingPagesInputSchema = z.strictObject({
  ...commonInputSchema,
  channel: channelSchema,
});
type LandingPagesArgs = z.infer<typeof landingPagesInputSchema>;

export const getUmamiLandingPagesTool = {
  name: "get_umami_landing_pages",
  config: {
    title: "Get Umami landing pages",
    description: `Read entry pages with visits and visitors from the project's connected Umami website. Organic Search (search-engine referrers) is the default, so the rows line up with Search Console pages; set channel to all for every entry. ${SCOPE_NOTE}`,
    inputSchema: landingPagesInputSchema,
    outputSchema: reportOutputSchema,
    annotations,
  },
  handler: createReportHandler<LandingPagesArgs>("Landing pages", (args) => ({
    ...args,
    kind: "landing_pages",
  })),
};

const pagePerformanceInputSchema = z.strictObject(commonInputSchema);
type PagePerformanceArgs = z.infer<typeof pagePerformanceInputSchema>;

export const getUmamiPagePerformanceTool = {
  name: "get_umami_page_performance",
  config: {
    title: "Get Umami page performance",
    description: `Read pageviews, visitors, and visits per page path from the project's connected Umami website, across all traffic. For organic entry pages, use get_umami_landing_pages. ${SCOPE_NOTE}`,
    inputSchema: pagePerformanceInputSchema,
    outputSchema: reportOutputSchema,
    annotations,
  },
  handler: createReportHandler<PagePerformanceArgs>(
    "Page performance",
    (args) => ({ ...args, kind: "page_performance" }),
  ),
};

const trafficSourcesInputSchema = z.strictObject({
  ...commonInputSchema,
  breakdown: z
    .enum(["referrer", "channel"])
    .optional()
    .default("referrer")
    .describe(
      "referrer lists referring domains; channel groups visits the way Umami does (organicSearch, direct, referral, organicSocial, and so on).",
    ),
  channel: channelSchema,
});
type TrafficSourcesArgs = z.infer<typeof trafficSourcesInputSchema>;

export const getUmamiTrafficSourcesTool = {
  name: "get_umami_traffic_sources",
  config: {
    title: "Get Umami traffic sources",
    description: `Compare where visits come from on the project's connected Umami website, by referring domain (visits and visitors) or by channel (visits, visitors, and pageviews). The referrer breakdown can be limited to search engines; the channel breakdown always covers every visit. ${SCOPE_NOTE}`,
    inputSchema: trafficSourcesInputSchema,
    outputSchema: reportOutputSchema,
    annotations,
  },
  handler: createReportHandler<TrafficSourcesArgs>(
    "Traffic sources",
    (args) => ({
      projectId: args.projectId,
      startDate: args.startDate,
      endDate: args.endDate,
      limit: args.limit,
      offset: args.offset,
      channel: args.channel,
      kind: args.breakdown === "channel" ? "channels" : "referrers",
    }),
  ),
};
