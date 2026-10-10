import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { BingService } from "@/server/features/bing/services/BingService";
import {
  BING_GROUP_BY,
  BING_MAX_ROW_LIMIT,
  BING_SORT_BY,
  type BingPerformanceInput,
  type BingPerformanceRow,
} from "@/server/features/bing/bingPerformance";
import {
  BingApiError,
  BingAuthError,
  BingNotConnectedError,
} from "@/server/lib/bingErrors";
import type { BingCrawlIssue } from "@/server/lib/bingClient";

const BING_PERF_COLUMNS: McpTableColumn<BingPerformanceRow>[] = [
  { header: "key", value: (row) => row.key },
  { header: "clicks", value: (row) => row.clicks },
  { header: "impressions", value: (row) => row.impressions },
  {
    header: "CTR",
    value: (row) => row.ctr,
    format: (value) =>
      typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—",
  },
  {
    header: "position",
    value: (row) => row.position,
    format: (value) => (typeof value === "number" ? value.toFixed(1) : "—"),
  },
];

const bingPerfInputSchema = {
  projectId: projectIdSchema,
  groupBy: z
    .enum(BING_GROUP_BY)
    .optional()
    .describe(
      "Aggregate by 'query' (default), 'page', or 'date'. 'date' returns a daily series (UTC) for trend/alignment; 'query' and 'page' rank keys over the whole period Bing reports.",
    ),
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(BING_MAX_ROW_LIMIT)
    .optional()
    .describe(
      `Rows per call (default 100, max ${BING_MAX_ROW_LIMIT}). Sorted by sortBy before slicing.`,
    ),
  minImpressions: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Keep rows with at least this many impressions."),
  minPosition: z
    .number()
    .min(1)
    .optional()
    .describe("Keep rows whose average position is >= this."),
  maxPosition: z
    .number()
    .min(1)
    .optional()
    .describe("Keep rows whose average position is <= this."),
  sortBy: z
    .enum(BING_SORT_BY)
    .optional()
    .describe(
      "Sort order before applying rowLimit (default 'clicks', or 'date' when groupBy is 'date').",
    ),
} as const;

type BingPerfArgs = z.infer<z.ZodObject<typeof bingPerfInputSchema>>;

function connectBingUrl(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/settings/integrations`);
}

function describeBingError(error: unknown): string {
  if (error instanceof BingNotConnectedError) {
    return "Bing Webmaster Tools is not connected for this project.";
  }
  if (error instanceof BingAuthError) {
    return "The Bing Webmaster API key was rejected or can no longer be read. Reconnect it to continue.";
  }
  if (error instanceof BingApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export const getBingSearchPerformanceTool = {
  name: "get_bing_search_performance",
  config: {
    title: "Get Bing Webmaster search performance",
    description:
      "Query the connected Bing Webmaster site's search performance: clicks, impressions, CTR, and average position, grouped by query, page, or date. First-party data from Bing — use it for a second engine's view of what ranks and what has demand. Bing returns one row per key per day over a fixed UTC window and offers no date filter, so results are summed across the period Bing reports; the response states that period as `coverage` (with the day count) and always includes a whole-window site `total` taken from Bing's site-traffic endpoint (the grouped rows are each a top-N subset, so their sum is not the site total; the total's clicks and impressions are that authoritative whole-site figure, but its average position is weighted over the top-N query rows because Bing's traffic endpoint reports no position, so it can differ from a true whole-site average). Use groupBy 'date' for a daily series, 'query'/'page' to rank keys. minImpressions/minPosition/maxPosition are applied server-side after aggregation. ctr is a 0-1 fraction; position is a 1-based impression-weighted average and is omitted for keys Bing reported without one. Bing is a separate engine from Google: do not add Bing and Search Console figures together, and align their windows via each source's coverage — Bing dates are UTC, Search Console uses America/Los_Angeles. Reads only the Bing site already connected to an OpenSEO project the caller is authorized to access. Read-only; uses no credits.",
    inputSchema: bingPerfInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      groupBy: z.string().optional(),
      coverage: z
        .looseObject({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          days: z.number(),
          timeZone: z.string(),
        })
        .optional(),
      total: z
        .looseObject({
          key: z.string(),
          clicks: z.number(),
          impressions: z.number(),
          ctr: z.number(),
          position: z.number().optional(),
        })
        .nullable()
        .optional(),
      rowCount: z.number().optional(),
      rows: z
        .array(
          z
            .object({
              key: z.string(),
              clicks: z.number(),
              impressions: z.number(),
              ctr: z.number(),
              position: z.number().optional(),
            })
            .passthrough(),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: BingPerfArgs, context) => {
    const connectUrl = connectBingUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings/integrations`,
    );

    try {
      const [result, summaryResult] = await Promise.all([
        BingService.getPerformance({
          projectId: args.projectId,
          groupBy: args.groupBy,
          rowLimit: args.rowLimit,
          minImpressions: args.minImpressions,
          minPosition: args.minPosition,
          maxPosition: args.maxPosition,
          sortBy: args.sortBy,
        } satisfies BingPerformanceInput),
        BingService.getSummary({ projectId: args.projectId }),
      ]);
      // The whole-site total comes from Bing's site-traffic endpoint, not the
      // grouped rows — the query and page reports are each a top-N subset.
      const total = summaryResult.summary
        ? { key: "total", ...summaryResult.summary }
        : null;

      const period =
        result.coverage.startDate && result.coverage.endDate
          ? ` · ${result.coverage.startDate}→${result.coverage.endDate} (${result.coverage.days}d ${result.coverage.timeZone})`
          : "";
      const totalLabel = total
        ? ` · total ${total.clicks} clicks / ${total.impressions} impressions`
        : "";
      const header =
        `${result.siteUrl} · by ${result.groupBy}${period}${totalLabel} · ` +
        `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`;
      const text =
        result.rows.length > 0
          ? `${header}\n${formatMcpTable(result.rows, BING_PERF_COLUMNS)}`
          : `${header}\nNo rows returned by Bing for this site.`;

      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          siteUrl: result.siteUrl,
          groupBy: result.groupBy,
          coverage: result.coverage,
          total,
          rowCount: result.rows.length,
          rows: result.rows,
        },
      });
    } catch (error) {
      const isNotConnected = error instanceof BingNotConnectedError;
      return mcpResponse({
        text: `${describeBingError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
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

// ---------------------------------------------------------------------------
// inspect_bing_urls
// ---------------------------------------------------------------------------

const inspectInputSchema = {
  projectId: projectIdSchema,
  urls: z
    .array(z.string().url())
    .min(1)
    .max(10)
    .describe(
      "1–10 absolute URLs to inspect. Each should belong to the connected Bing site.",
    ),
} as const;

type InspectArgs = z.infer<z.ZodObject<typeof inspectInputSchema>>;

export const inspectBingUrlsTool = {
  name: "inspect_bing_urls",
  config: {
    title: "Inspect URLs in Bing Webmaster Tools",
    description:
      "Read Bing Webmaster Tools' crawl details for up to 10 URLs of the connected site: HTTP status, last-crawled and discovery dates, whether Bing treats it as a page, document size, inbound link (anchor) count, and child-URL count. Use it to see how Bing has crawled specific pages. Bing has no indexing-status, robots-directive, or content-changed property, and reports HTTP status 0 when it has none (surfaced as httpStatusReported: false rather than a fake code). Per-URL failures are reported inline. Reads only the Bing site already connected to an OpenSEO project the caller is authorized to access. Read-only; uses no credits.",
    inputSchema: inspectInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      results: z
        .array(
          z
            .object({
              url: z.string(),
              result: z.unknown().nullable().optional(),
              error: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: InspectArgs, context) => {
    const connectUrl = connectBingUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings/integrations`,
    );

    try {
      const { siteUrl, results } = await BingService.inspectUrls({
        projectId: args.projectId,
        urls: args.urls,
      });

      const summaryLines = results.map((entry) => {
        if (entry.error) return `  ${entry.url} — error: ${entry.error}`;
        const info = entry.result;
        if (!info) return `  ${entry.url} — no data`;
        const status = info.httpStatusReported
          ? `HTTP ${info.httpStatus}`
          : "HTTP not reported";
        const crawled = info.lastCrawledDate
          ? `, last crawled ${info.lastCrawledDate}`
          : "";
        const anchors =
          info.anchorCount === undefined ? "" : `, ${info.anchorCount} anchors`;
        return `  ${entry.url} — ${status}${crawled}${anchors}`;
      });
      const text =
        `${siteUrl} · inspected ${results.length} URL${results.length === 1 ? "" : "s"}\n` +
        summaryLines.join("\n");

      return mcpResponse({
        text,
        meta,
        structuredContent: { ok: true, siteUrl, results },
      });
    } catch (error) {
      const isNotConnected = error instanceof BingNotConnectedError;
      return mcpResponse({
        text: `${describeBingError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
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

// ---------------------------------------------------------------------------
// get_bing_crawl_stats
// ---------------------------------------------------------------------------

const BING_CRAWL_ISSUE_COLUMNS: McpTableColumn<BingCrawlIssue>[] = [
  { header: "url", value: (row) => row.url },
  { header: "http", value: (row) => row.httpCode },
  { header: "inLinks", value: (row) => row.inLinks },
  { header: "issues", value: (row) => row.issues },
];

const crawlInputSchema = { projectId: projectIdSchema } as const;
type CrawlArgs = z.infer<z.ZodObject<typeof crawlInputSchema>>;

export const getBingCrawlStatsTool = {
  name: "get_bing_crawl_stats",
  config: {
    title: "Get Bing Webmaster crawl and index stats",
    description:
      "Read Bing Webmaster Tools' crawl and index view for the connected site: per-day counts of pages crawled, pages in Bing's index, crawl errors, response-code buckets (2xx/301/302/4xx/5xx), robots-blocked, DNS failures, connection timeouts, malware flags, and inbound links — plus the URLs Bing reports crawl issues for. Use it to see how Bing is crawling and indexing the site and what it is failing on. Bing reports crawl stats per day over a fixed window with no date filter, and exposes crawl issues as a URL, its HTTP code, inbound-link count, and an undocumented issues bitmask (passed through, not decoded). Reads only the Bing site already connected to an OpenSEO project the caller is authorized to access. Read-only; uses no credits.",
    inputSchema: crawlInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      latest: z.unknown().nullable().optional(),
      days: z.number().optional(),
      issueCount: z.number().optional(),
      issues: z.array(z.unknown()).optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: CrawlArgs, context) => {
    const connectUrl = connectBingUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/settings/integrations`,
    );

    try {
      const { siteUrl, stats, issues } = await BingService.getCrawl({
        projectId: args.projectId,
      });
      const latest = stats.at(-1) ?? null;
      const lines = [
        `${siteUrl} · ${stats.length} day${stats.length === 1 ? "" : "s"} of crawl stats`,
      ];
      if (latest) {
        lines.push(
          `Latest ${latest.date}: ${latest.crawledPages} crawled, ${latest.inIndex} in index, ${latest.crawlErrors} errors (4xx ${latest.code4xx}, 5xx ${latest.code5xx}), ${latest.blockedByRobotsTxt} robots-blocked`,
        );
      }
      lines.push(
        issues.length === 0
          ? "No crawl issues reported by Bing."
          : `Crawl issues (${issues.length}):\n${formatMcpTable(issues, BING_CRAWL_ISSUE_COLUMNS)}`,
      );

      return mcpResponse({
        text: lines.join("\n"),
        meta,
        structuredContent: {
          ok: true,
          siteUrl,
          latest,
          days: stats.length,
          issueCount: issues.length,
          issues,
        },
      });
    } catch (error) {
      const isNotConnected = error instanceof BingNotConnectedError;
      return mcpResponse({
        text: `${describeBingError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
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
