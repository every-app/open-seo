import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { hasSelfHostedGa4Config } from "@/server/features/ga4/oauth-config";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  Ga4NotConnectedError,
  Ga4Service,
} from "@/server/features/ga4/services/Ga4Service";
import {
  GA4_DATE_RANGES,
  GA4_DIMENSIONS,
  GA4_DEFAULT_ROW_LIMIT,
  GA4_FILTER_OPERATORS,
  GA4_MAX_ROW_LIMIT,
  GA4_METRICS,
  type Ga4PerformanceInput,
} from "@/server/features/ga4/analyticsReport";
import { Ga4ApiError, Ga4TokenError } from "@/server/lib/ga4Client";
import { GA4_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/ga4";

type ProjectAuthContext = {
  auth: { organizationId: string };
  baseUrl: string;
};

function connectGa4Url(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/settings`);
}

/** Self-hosted GA4 requires the operator to provide a Google OAuth client and
 *  BETTER_AUTH_SECRET. Hosted mode always has both; self-hosted tools return
 *  this setup nudge before attempting a token lookup when either is missing. */
async function missingSelfHostedGoogleClientResponse(
  context: ProjectAuthContext,
  projectId: string,
) {
  const [hosted, configured] = await Promise.all([
    isHostedServerAuthMode(),
    hasSelfHostedGa4Config(),
  ]);
  if (hosted || configured) return null;

  return mcpResponse({
    text: `This self-hosted OpenSEO deployment is not configured for Analytics yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET, then connect Analytics from the project's settings page. Setup docs: ${GA4_SELF_HOSTED_SETUP_DOCS_URL}`,
    meta: buildProjectMeta(context, projectId),
    structuredContent: {
      ok: false,
      connected: false,
      reason: "ga4_oauth_not_configured",
      setupDocsUrl: GA4_SELF_HOSTED_SETUP_DOCS_URL,
    },
  });
}

function invalidRequest(
  meta: ReturnType<typeof buildProjectMeta>,
  message: string,
) {
  return mcpResponse({
    text: message,
    meta,
    structuredContent: { ok: false, reason: "invalid_request" },
  });
}

function describeGa4Error(error: unknown): string {
  if (error instanceof Ga4NotConnectedError) {
    return "Analytics is not connected for this project.";
  }
  if (error instanceof Ga4TokenError) {
    return "The Analytics connection has expired or was revoked. Reconnect it to continue.";
  }
  if (error instanceof Ga4ApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** A GA4 report row is dimensionValues[]/metricValues[] in header order — flatten
 *  each row into a plain {name: value} object keyed by the requested field
 *  names, which is what both the text table and structuredContent want. */
function flattenRows(
  dimensions: string[],
  metrics: string[],
  rows: Array<{
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }>,
): Array<Record<string, string>> {
  return rows.map((row) => {
    const flat: Record<string, string> = {};
    dimensions.forEach((name, i) => {
      flat[name] = row.dimensionValues?.[i]?.value ?? "";
    });
    metrics.forEach((name, i) => {
      flat[name] = row.metricValues?.[i]?.value ?? "";
    });
    return flat;
  });
}

// ---------------------------------------------------------------------------
// get_analytics_performance
// ---------------------------------------------------------------------------

const filterSchema = z.object({
  dimension: z.enum(GA4_DIMENSIONS),
  operator: z.enum(GA4_FILTER_OPERATORS).default("equals"),
  expression: z.string().min(1),
});

const perfInputSchema = {
  projectId: projectIdSchema,
  dimensions: z
    .array(z.enum(GA4_DIMENSIONS))
    .min(1)
    .max(4)
    .optional()
    .describe(
      "Group rows by these dimensions. Default ['date']. Use ['sessionDefaultChannelGroup'] for the channel-mix question Search Console can't answer (organic search vs. direct vs. referral vs. email vs. paid); ['pagePath'] for top pages by real visits, not just search clicks.",
    ),
  metrics: z
    .array(z.enum(GA4_METRICS))
    .min(1)
    .max(10)
    .describe(
      "Metrics to return, e.g. ['sessions','totalUsers']. At least one is required — GA4 has no implicit default metric set the way Search Console has clicks/impressions.",
    ),
  dateRange: z
    .enum(GA4_DATE_RANGES)
    .optional()
    .describe(
      "Convenience window (default last_28_days). Ignored if startDate+endDate are given. Unlike Search Console, GA4 has no fixed lookback ceiling — how far back real data exists depends on the property's own data-retention setting.",
    ),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit start (YYYY-MM-DD). Use with endDate."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit end (YYYY-MM-DD). Use with startDate."),
  filters: z
    .array(filterSchema)
    .max(5)
    .optional()
    .describe(
      "AND-combined filters on dimension values, e.g. [{dimension:'sessionDefaultChannelGroup',operator:'equals',expression:'Organic Search'}].",
    ),
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(GA4_MAX_ROW_LIMIT)
    .optional()
    .describe("Rows per call (default 1000, max 1000)."),
  startRow: z.number().int().min(0).optional().describe("Pagination offset."),
} as const;

type PerfArgs = z.infer<z.ZodObject<typeof perfInputSchema>>;

export const getAnalyticsPerformanceTool = {
  name: "get_analytics_performance",
  config: {
    title: "Get Google Analytics (GA4) performance",
    description:
      "Query the connected GA4 property's report data (sessions, users, engagement, and more) by date, channel, page, country or device. Use this for questions Search Console can't answer: total visits across every channel, and the channel mix (organic search vs. direct vs. referral vs. email vs. paid) — 'email' only appears if the visited link carried UTM tags. Read-only; uses no credits.",
    inputSchema: perfInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      setupDocsUrl: z.string().optional(),
      propertyId: z.string().optional(),
      propertyDisplayName: z.string().nullable().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      dimensions: z.array(z.string()).optional(),
      metrics: z.array(z.string()).optional(),
      rowCount: z.number().optional(),
      rows: z.array(z.record(z.string(), z.string())).optional(),
      hasMore: z.boolean().optional(),
      nextStartRow: z.number().optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PerfArgs, context) => {
    const blocked = await missingSelfHostedGoogleClientResponse(
      context,
      args.projectId,
    );
    if (blocked) return blocked;

    const connectUrl = connectGa4Url(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );

    if (Boolean(args.startDate) !== Boolean(args.endDate)) {
      return invalidRequest(
        meta,
        "Provide both startDate and endDate, or neither (use dateRange instead).",
      );
    }

    try {
      const result = await Ga4Service.getPerformance(
        args satisfies Ga4PerformanceInput,
      );
      const dimensions =
        result.request.dimensions?.map((d) => d.name) ?? [];
      const metrics = result.request.metrics.map((m) => m.name);
      const rawRows = result.report.rows ?? [];
      const rows = flattenRows(dimensions, metrics, rawRows);
      const requestedLimit = result.request.limit ?? GA4_DEFAULT_ROW_LIMIT;
      const offset = result.request.offset ?? 0;
      // GA4 reports the true total in rowCount, unlike Search Console — prefer
      // it so the last exact-multiple-of-limit page doesn't misreport hasMore.
      // Fall back to the length-vs-limit heuristic only if it's ever absent.
      const hasMore =
        result.report.rowCount !== undefined
          ? offset + rows.length < result.report.rowCount
          : rows.length >= requestedLimit;
      const nextStartRow = offset + rows.length;

      const columns: McpTableColumn<Record<string, string>>[] = [
        ...dimensions.map((name) => ({
          header: name,
          value: (row: Record<string, string>) => row[name] ?? "",
        })),
        ...metrics.map((name) => ({
          header: name,
          value: (row: Record<string, string>) => row[name] ?? "",
        })),
      ];

      const propertyLabel = result.propertyDisplayName
        ? `${result.propertyId} (${result.propertyDisplayName})`
        : result.propertyId;
      const header =
        `${propertyLabel} · ${dimensions.join("+")} · ${result.request.dateRanges[0].startDate}→${result.request.dateRanges[0].endDate} · ` +
        `${rows.length} row${rows.length === 1 ? "" : "s"}${hasMore ? " (more available — paginate with startRow)" : ""}`;
      const text =
        rows.length > 0
          ? `${header}\n${formatMcpTable(rows, columns)}`
          : `${header}\nNo rows for this query/date range.`;

      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          propertyId: result.propertyId,
          propertyDisplayName: result.propertyDisplayName,
          startDate: result.request.dateRanges[0].startDate,
          endDate: result.request.dateRanges[0].endDate,
          dimensions,
          metrics,
          rowCount: rows.length,
          rows,
          hasMore,
          nextStartRow: hasMore ? nextStartRow : undefined,
        },
      });
    } catch (error) {
      const isNotConnected = error instanceof Ga4NotConnectedError;
      return mcpResponse({
        text: `${describeGa4Error(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
        meta,
        structuredContent: {
          ok: false,
          reason: isNotConnected ? "not_connected" : "api_error",
          connectUrl,
        },
      });
    }
  }),
};
