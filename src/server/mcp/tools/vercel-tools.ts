import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import {
  VercelAnalyticsService,
  VercelNotConnectedError,
} from "@/server/features/vercel/services/VercelAnalyticsService";
import { isExpectedVercelFailure } from "@/server/lib/vercelAnalytics";

type TrafficRow = { key: string; visitors: number; pageviews: number };

function buildColumns(keyHeader: string): McpTableColumn<TrafficRow>[] {
  return [
    {
      header: keyHeader,
      value: (row) => (row.key === "" ? "(direct)" : row.key),
    },
    { header: "visitors", value: (row) => row.visitors },
    { header: "pageviews", value: (row) => row.pageviews },
  ];
}

const trafficInputSchema = {
  projectId: projectIdSchema,
  dimension: z
    .enum(["referrer", "page", "day"])
    .default("referrer")
    .describe(
      "Group visits by referrer hostname, page path, or day (last 30 days).",
    ),
  limit: z.number().int().min(1).max(50).default(25),
} as const;

type TrafficArgs = z.infer<z.ZodObject<typeof trafficInputSchema>>;

export const getVercelTrafficTool = {
  name: "get_vercel_traffic",
  config: {
    title: "Get Vercel Web Analytics traffic",
    description:
      "Read the connected Vercel project's Web Analytics for the last 30 days: total visitors/pageviews with an exact prior-30-day comparison, plus rows grouped by referrer hostname (spot search engines and AI assistants like claude.ai or chatgpt.com), page path, or day. A '(direct)' row is direct traffic and 'Others' is Vercel's tail bucket. Read-only; uses no credits.",
    inputSchema: trafficInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      vercelProjectName: z.string().optional(),
      totals: looseObjectOutputSchema.optional(),
      prevTotals: looseObjectOutputSchema.optional(),
      rowCount: z.number().optional(),
      rows: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: TrafficArgs, context) => {
    const connectUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/settings`,
    );
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );

    try {
      const report = await VercelAnalyticsService.getTraffic({
        projectId: args.projectId,
      });
      const source =
        args.dimension === "page"
          ? report.pages
          : args.dimension === "day"
            ? report.daily
            : report.referrers;
      const rows = source.slice(0, args.limit);
      const keyHeader =
        args.dimension === "page"
          ? "path"
          : args.dimension === "day"
            ? "day"
            : "referrer";

      const summary = `${report.vercelProjectName} · ${report.range.since} to ${report.range.until} · ${report.totals.visitors} visitors / ${report.totals.pageviews} pageviews (prev 30d: ${report.prevTotals.visitors} / ${report.prevTotals.pageviews})`;
      const text =
        rows.length === 0
          ? `${summary}\nNo rows for this dimension yet.`
          : `${summary}\n${formatMcpTable(rows, buildColumns(keyHeader))}`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          vercelProjectName: report.vercelProjectName,
          totals: report.totals,
          prevTotals: report.prevTotals,
          rowCount: rows.length,
          rows,
        },
      });
    } catch (error) {
      if (error instanceof VercelNotConnectedError) {
        return mcpResponse({
          text: `Vercel Web Analytics is not connected for this project. Connect it in project settings: ${connectUrl}`,
          meta,
          structuredContent: {
            ok: false,
            reason: "not_connected",
            connectUrl,
          },
        });
      }
      if (isExpectedVercelFailure(error)) {
        return mcpResponse({
          text: `The Vercel access token was rejected (revoked or missing access). Update VERCEL_TOKEN on this deployment.`,
          meta,
          structuredContent: {
            ok: false,
            reason: "api_error",
            connectUrl,
          },
        });
      }
      throw error;
    }
  }),
};
