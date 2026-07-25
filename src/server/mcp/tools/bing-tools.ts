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
import { buildBingStrikingRows } from "@/server/features/bing/bingQueryReport";

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

/** Aggregated query/page row exposed by get_bing_queries. */
type BingQueryRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

function buildQueryColumns(keyHeader: string): McpTableColumn<BingQueryRow>[] {
  return [
    { header: keyHeader, value: (row) => row.key },
    { header: "clicks", value: (row) => row.clicks },
    { header: "impressions", value: (row) => row.impressions },
    { header: "ctr", value: (row) => `${(row.ctr * 100).toFixed(1)}%` },
    {
      header: "position",
      value: (row) => (row.position === null ? "-" : row.position.toFixed(1)),
    },
  ];
}

const queriesInputSchema = {
  projectId: projectIdSchema,
  dimension: z
    .enum(["query", "page"])
    .default("query")
    .describe("Group rows by search query or by page URL."),
  strikingDistanceOnly: z
    .boolean()
    .default(false)
    .describe(
      "Only queries at average position 5-20, sorted by impressions (query rows only).",
    ),
  pageUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Drill down to the queries driving one specific page (GetPageQueryStats). Ignores dimension; an unknown page returns 0 rows.",
    ),
  limit: z.number().int().min(1).max(500).default(100),
} as const;

type QueriesArgs = z.infer<z.ZodObject<typeof queriesInputSchema>>;

export const getBingQueriesTool = {
  name: "get_bing_queries",
  config: {
    title: "Get Bing Webmaster queries",
    description:
      "Read the connected Bing Webmaster site's top queries or pages (GetQueryStats/GetPageStats), aggregated over Bing's whole sampled window (~5 months, ~16 sample dates). Columns: clicks, impressions, CTR, and impression-weighted average position. Bing accepts no date range or paging here, so rows are whole-window totals. Set strikingDistanceOnly to get queries at positions 5-20 by impressions. Set pageUrl to drill down to the queries driving one specific page. Read-only; uses no credits.",
    inputSchema: queriesInputSchema,
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
  handler: withMcpProjectAuth(async (args: QueriesArgs, context) => {
    const connectUrl = bingConnectUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );

    try {
      let siteUrl: string;
      let source: BingQueryRow[];
      let label: string;
      if (args.pageUrl) {
        const pageReport = await BingService.getPageQueries({
          projectId: args.projectId,
          pageUrl: args.pageUrl,
        });
        siteUrl = pageReport.siteUrl;
        source = args.strikingDistanceOnly
          ? buildBingStrikingRows(pageReport.queries)
          : pageReport.queries;
        label = `queries for ${args.pageUrl}`;
      } else {
        const report = await BingService.getQueryReport({
          projectId: args.projectId,
        });
        siteUrl = report.siteUrl;
        source =
          args.dimension === "page"
            ? report.pages
            : args.strikingDistanceOnly
              ? report.striking
              : report.queries;
        label =
          args.dimension === "page"
            ? "pages"
            : args.strikingDistanceOnly
              ? "striking-distance queries (position 5-20)"
              : "queries";
      }
      const rows = source.slice(0, args.limit);

      if (rows.length === 0) {
        return mcpResponse({
          text: `No Bing ${label} for ${siteUrl}. Bing may not have sampled data for ${args.pageUrl ? "this page" : "this site"} yet.`,
          meta,
          structuredContent: {
            ok: true,
            siteUrl,
            rowCount: 0,
            rows: [],
          },
        });
      }

      const header = `${siteUrl} · top ${rows.length} of ${source.length} ${label} · whole-window aggregate of Bing's sampled data`;
      const text = `${header}\n${formatMcpTable(
        rows,
        buildQueryColumns(
          args.dimension === "page" && !args.pageUrl ? "page" : "query",
        ),
      )}`;
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
