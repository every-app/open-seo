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

type BingPerfRow = Record<string, unknown>;

/** Bing's GetRankAndTrafficStats field names aren't verified against the live
 *  API, so derive the table columns from the keys actually present across the
 *  returned rows (union, first-seen order) rather than hard-coding any. */
function deriveColumns(
  rows: readonly BingPerfRow[],
): McpTableColumn<BingPerfRow>[] {
  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys.map((key) => ({
    header: key,
    value: (row: BingPerfRow) => row[key],
  }));
}

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
      "Read the connected Bing Webmaster site's rank and traffic stats (GetRankAndTrafficStats) for a project: daily totals as Bing returns them. The row shape follows Bing's response fields, which vary by site, so columns are derived from the data. Read-only; uses no credits.",
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
        const text = `No Bing Webmaster performance data for ${siteUrl}. Connect or verify a site in project settings, or try a different date range.`;
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

      const columns = deriveColumns(rows);
      const header = `${siteUrl} · ${rows.length} row${rows.length === 1 ? "" : "s"}`;
      const text = `${header}\n${formatMcpTable(rows, columns)}`;
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
