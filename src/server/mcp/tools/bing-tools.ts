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
  BingNotConnectedError,
  BingService,
  isExpectedGrantFailure,
} from "@/server/features/bing/services/BingService";

/** One daily row from GetRankAndTrafficStats. Field names verified against the
 *  live API on 2026-07-25 and typed in bingClient, so the columns are fixed —
 *  same shape as every other MCP tool's table. */
type BingPerfRow = {
  date: string | null;
  clicks: number;
  impressions: number;
};

const BING_PERF_COLUMNS: McpTableColumn<BingPerfRow>[] = [
  { header: "date", value: (row) => row.date ?? "(unknown)" },
  { header: "clicks", value: (row) => row.clicks },
  { header: "impressions", value: (row) => row.impressions },
];

const perfInputSchema = {
  projectId: projectIdSchema,
} as const;

type PerfArgs = z.infer<z.ZodObject<typeof perfInputSchema>>;

function bingConnectUrl(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/settings`);
}

export const getBingPerformanceTool = {
  name: "get_bing_performance",
  config: {
    title: "Get Bing Webmaster performance",
    description:
      "Read the connected Bing Webmaster site's daily clicks and impressions from Bing Webmaster Tools (GetRankAndTrafficStats). One row per day. Bing accepts no date range, dimensions, or paging on this endpoint, so it returns whatever window Bing decides to report. Read-only; uses no credits.",
    inputSchema: perfInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
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
  handler: withMcpProjectAuth(async (args: PerfArgs, context) => {
    const connectUrl = bingConnectUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );

    try {
      const result = await BingService.getPerformance({
        projectId: args.projectId,
      });
      const { siteUrl, rows } = result;

      if (rows.length === 0) {
        const text = `No Bing Webmaster performance data for ${siteUrl}. Bing may not have reported traffic for this site yet. Note that Bing accepts no date range on this endpoint, so there is no window to widen.`;
        return mcpResponse({
          text,
          meta,
          structuredContent: {
            ok: true,
            siteUrl,
            rowCount: 0,
            rows: [],
          },
        });
      }

      const header = `${siteUrl} · ${rows.length} row${rows.length === 1 ? "" : "s"}`;
      const text = `${header}\n${formatMcpTable(rows, BING_PERF_COLUMNS)}`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          siteUrl,
          rowCount: rows.length,
          rows,
        },
      });
    } catch (error) {
      if (error instanceof BingNotConnectedError) {
        return mcpResponse({
          text: `Bing Webmaster is not connected for this project. Connect it in project settings: ${connectUrl}`,
          meta,
          structuredContent: {
            ok: false,
            reason: "not_connected",
            connectUrl,
          },
        });
      }
      if (isExpectedGrantFailure(error)) {
        return mcpResponse({
          text: `The Bing Webmaster connection has expired or was revoked. Reconnect it in project settings: ${connectUrl}`,
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
