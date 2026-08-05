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
import { BingAiCitationService } from "@/server/features/bing/services/BingAiCitationService";
import type { BingAiCitationDay } from "@/server/features/bing/repositories/BingAiCitationDayRepository";
import type {
  BingAiCitationSnapshot,
  BingAiPageCitation,
  BingAiQueryCitation,
} from "@/server/features/bing/repositories/BingAiCitationSnapshotRepository";

const OVERVIEW_COLUMNS: McpTableColumn<BingAiCitationDay>[] = [
  { header: "date", value: (row) => row.date },
  { header: "citations", value: (row) => row.citations },
  { header: "cited pages", value: (row) => row.citedPages },
];
const PAGE_COLUMNS: McpTableColumn<BingAiPageCitation>[] = [
  { header: "page", value: (row) => row.page },
  { header: "citations", value: (row) => row.citations },
];
const QUERY_COLUMNS: McpTableColumn<BingAiQueryCitation>[] = [
  { header: "query", value: (row) => row.query },
  { header: "intent", value: (row) => row.intent },
  { header: "topic", value: (row) => row.topic },
  { header: "citations", value: (row) => row.citations },
  {
    header: "share",
    value: (row) => `${row.citationSharePercent.toFixed(1)}%`,
  },
];

const citationsInputSchema = {
  projectId: projectIdSchema,
  reportType: z
    .enum(["overview", "pages", "queries"])
    .default("overview")
    .describe(
      "Which uploaded CSV to read: the daily overview, the page breakdown, or the query breakdown.",
    ),
  snapshotId: z
    .string()
    .optional()
    .describe(
      "Pages/queries only: a specific upload to read. Defaults to the most recent.",
    ),
  limit: z.number().int().min(1).max(500).default(100),
} as const;

type CitationsArgs = z.infer<z.ZodObject<typeof citationsInputSchema>>;

function snapshotHeader(
  label: string,
  snapshot: BingAiCitationSnapshot,
  totalRows: number,
  shownRows: number,
  snapshotCount: number,
): string {
  return `${label} snapshot ${snapshot.periodStart} to ${snapshot.periodEnd} · top ${shownRows} of ${totalRows} rows · ${snapshotCount} upload${snapshotCount === 1 ? "" : "s"} available`;
}

export const getBingAiCitationsTool = {
  name: "get_bing_ai_citations",
  config: {
    title: "Get Bing AI citations",
    description:
      "Bing Webmaster Tools' AI performance report (citations of this site in Bing Copilot/AI answers) has no API — the numbers come from CSVs uploaded on the project's Bing page. reportType=overview reads the daily citations/cited-pages history. reportType=pages or queries read the most recently uploaded breakdown for that report (or a specific past upload via snapshotId); each upload covers whatever date window was entered when it was uploaded, since neither report carries a per-row date. Read-only; uses no credits.",
    inputSchema: citationsInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reportType: z.string(),
      rowCount: z.number().optional(),
      rows: z.array(looseObjectOutputSchema).optional(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      snapshotCount: z.number().optional(),
      uploadUrl: z.string().optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: CitationsArgs, context) => {
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/bing`,
    );
    const uploadUrl = meta.url;

    if (args.reportType === "overview") {
      const days = await BingAiCitationService.getOverview(args.projectId);
      if (days.length === 0) {
        return mcpResponse({
          text: `No AI performance CSV uploaded yet for this project. Upload the Overview export on the Bing page: ${uploadUrl}`,
          meta,
          structuredContent: {
            ok: true,
            reportType: "overview",
            rowCount: 0,
            rows: [],
            uploadUrl,
          },
        });
      }
      const rows = days.slice(-args.limit).toReversed();
      const header = `${days.length} day${days.length === 1 ? "" : "s"} imported, ${days[0]?.date} to ${days[days.length - 1]?.date}`;
      return mcpResponse({
        text: `${header}\n${formatMcpTable(rows, OVERVIEW_COLUMNS)}`,
        meta,
        structuredContent: {
          ok: true,
          reportType: "overview",
          rowCount: rows.length,
          rows,
          uploadUrl,
        },
      });
    }

    if (args.reportType === "pages") {
      const detail = await BingAiCitationService.getPagesSnapshotDetail(
        args.projectId,
        args.snapshotId ?? null,
      );
      if (!detail.snapshot) {
        return mcpResponse({
          text: `No pages CSV uploaded yet for this project. Upload one on the Bing page: ${uploadUrl}`,
          meta,
          structuredContent: {
            ok: true,
            reportType: "pages",
            rowCount: 0,
            rows: [],
            snapshotCount: 0,
            uploadUrl,
          },
        });
      }
      const rows = detail.rows.slice(0, args.limit);
      const text = `${snapshotHeader("pages", detail.snapshot, detail.rows.length, rows.length, detail.snapshots.length)}\n${formatMcpTable(rows, PAGE_COLUMNS)}`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          reportType: "pages",
          rowCount: rows.length,
          rows,
          periodStart: detail.snapshot.periodStart,
          periodEnd: detail.snapshot.periodEnd,
          snapshotCount: detail.snapshots.length,
          uploadUrl,
        },
      });
    }

    const detail = await BingAiCitationService.getQueriesSnapshotDetail(
      args.projectId,
      args.snapshotId ?? null,
    );
    if (!detail.snapshot) {
      return mcpResponse({
        text: `No queries CSV uploaded yet for this project. Upload one on the Bing page: ${uploadUrl}`,
        meta,
        structuredContent: {
          ok: true,
          reportType: "queries",
          rowCount: 0,
          rows: [],
          snapshotCount: 0,
          uploadUrl,
        },
      });
    }
    const rows = detail.rows.slice(0, args.limit);
    const text = `${snapshotHeader("queries", detail.snapshot, detail.rows.length, rows.length, detail.snapshots.length)}\n${formatMcpTable(rows, QUERY_COLUMNS)}`;
    return mcpResponse({
      text,
      meta,
      structuredContent: {
        ok: true,
        reportType: "queries",
        rowCount: rows.length,
        rows,
        periodStart: detail.snapshot.periodStart,
        periodEnd: detail.snapshot.periodEnd,
        snapshotCount: detail.snapshots.length,
        uploadUrl,
      },
    });
  }),
};
