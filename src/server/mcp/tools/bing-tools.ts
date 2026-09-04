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

type BingCrawlRow = {
  date: string | null;
  crawledPages: number;
  inIndex: number;
  crawlErrors: number;
  code4xx: number;
  code5xx: number;
  blockedByRobotsTxt: number;
  containsMalware: number;
};

type BingLinkRow = {
  url: string;
  count: number;
};

const BING_PERF_COLUMNS: McpTableColumn<BingPerfRow>[] = [
  { header: "date", value: (row) => row.date ?? "(unknown)" },
  { header: "clicks", value: (row) => row.clicks },
  { header: "impressions", value: (row) => row.impressions },
];

const BING_CRAWL_COLUMNS: McpTableColumn<BingCrawlRow>[] = [
  { header: "date", value: (row) => row.date ?? "(unknown)" },
  { header: "crawled", value: (row) => row.crawledPages },
  { header: "in index", value: (row) => row.inIndex },
  { header: "crawl errors", value: (row) => row.crawlErrors },
  { header: "4xx", value: (row) => row.code4xx },
  { header: "5xx", value: (row) => row.code5xx },
  { header: "robots blocked", value: (row) => row.blockedByRobotsTxt },
  { header: "malware", value: (row) => row.containsMalware },
];

const BING_LINK_COLUMNS: McpTableColumn<BingLinkRow>[] = [
  { header: "linking URL", value: (row) => row.url },
  { header: "links", value: (row) => row.count },
];

const perfInputSchema = {
  projectId: projectIdSchema,
} as const;

type PerfArgs = z.infer<z.ZodObject<typeof perfInputSchema>>;

const linksInputSchema = {
  projectId: projectIdSchema,
  page: z
    .number()
    .int()
    .min(0)
    .max(32_767)
    .default(0)
    .describe("Zero-based page number returned by Bing (default 0)."),
} as const;

type LinksArgs = z.infer<z.ZodObject<typeof linksInputSchema>>;

function bingConnectUrl(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/settings`);
}

export const getBingPerformanceTool = {
  name: "get_bing_search_performance",
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

export const getBingCrawlStatsTool = {
  name: "get_bing_crawl_stats",
  config: {
    title: "Get Bing Webmaster crawl stats",
    description:
      "Read daily crawl and index-health totals for the project's connected Bing Webmaster site (GetCrawlStats). Bing chooses the native reporting window. Read-only; uses no credits.",
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
      const { siteUrl, rows } = await BingService.getCrawlStats({
        projectId: args.projectId,
      });
      if (rows.length === 0) {
        return mcpResponse({
          text: `No Bing Webmaster crawl statistics are available for ${siteUrl}. Bing may not have crawled or reported this site yet.`,
          meta,
          structuredContent: { ok: true, siteUrl, rowCount: 0, rows: [] },
        });
      }
      return mcpResponse({
        text: `${siteUrl} · ${rows.length} crawl-stat row${rows.length === 1 ? "" : "s"}\n${formatMcpTable(rows, BING_CRAWL_COLUMNS)}`,
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

export { getBingKeywordsTool } from "./bing-keywords-tool";

export const getBingLinksTool = {
  name: "get_bing_links",
  config: {
    title: "Get Bing Webmaster links",
    description:
      "Read one zero-based page of inbound-link counts for the project's connected Bing Webmaster site (GetLinkCounts). Read-only; uses no credits.",
    inputSchema: linksInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      page: z.number().optional(),
      totalPages: z.number().optional(),
      linkCount: z.number().optional(),
      links: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: LinksArgs, context) => {
    const connectUrl = bingConnectUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings`,
    );

    try {
      const { siteUrl, page, totalPages, links } = await BingService.getLinks({
        projectId: args.projectId,
        page: args.page,
      });
      const summary = `${siteUrl} · Bing link page ${page} of ${totalPages}`;
      return mcpResponse({
        text:
          links.length === 0
            ? `${summary}. No link rows were returned for this page.`
            : `${summary}\n${formatMcpTable(links, BING_LINK_COLUMNS)}`,
        meta,
        structuredContent: {
          ok: true,
          siteUrl,
          page,
          totalPages,
          linkCount: links.length,
          links,
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
