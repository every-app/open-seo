import { z } from "zod";
import {
  BingNotConnectedError,
  BingService,
  isExpectedGrantFailure,
} from "@/server/features/bing/services/BingService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { buildDashboardUrl } from "@/server/mcp/urls";

type BingKeywordRow = {
  query: string;
  date: string | null;
  clicks: number;
  impressions: number;
  averageClickPosition: number;
  averageImpressionPosition: number;
};

const BING_KEYWORD_COLUMNS: McpTableColumn<BingKeywordRow>[] = [
  { header: "query", value: (row) => row.query },
  { header: "date", value: (row) => row.date ?? "(unknown)" },
  { header: "clicks", value: (row) => row.clicks },
  { header: "impressions", value: (row) => row.impressions },
  {
    header: "avg impression position",
    value: (row) => row.averageImpressionPosition,
  },
  {
    header: "avg click position",
    value: (row) => row.averageClickPosition,
  },
];

const inputSchema = { projectId: projectIdSchema } as const;
type KeywordArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export const getBingKeywordsTool = {
  name: "get_bing_keywords",
  config: {
    title: "Get Bing Webmaster keywords",
    description:
      "Read sampled keyword rows for the project's connected Bing Webmaster site (GetQueryStats), including clicks, impressions, and average positions. Bing chooses the native reporting window and offers no paging or date-range parameters. Read-only; uses no credits.",
    inputSchema,
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
  handler: withMcpProjectAuth(async (args: KeywordArgs, context) => {
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
      const { siteUrl, rows } = await BingService.getKeywords({
        projectId: args.projectId,
      });
      if (rows.length === 0) {
        return mcpResponse({
          text: `No Bing Webmaster keyword data are available for ${siteUrl}. Bing may not have enough sampled search traffic for this site yet.`,
          meta,
          structuredContent: { ok: true, siteUrl, rowCount: 0, rows: [] },
        });
      }
      return mcpResponse({
        text: `${siteUrl} · ${rows.length} sampled keyword row${rows.length === 1 ? "" : "s"}\n${formatMcpTable(rows, BING_KEYWORD_COLUMNS)}`,
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
