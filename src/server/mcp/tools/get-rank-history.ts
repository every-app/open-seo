import { z } from "zod";
import { getRankHistory } from "@/server/features/rank-tracking/services/rankTrackingResults";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

const HISTORY_MAX_LIMIT = 200;

type HistoryCheck = Awaited<
  ReturnType<typeof getRankHistory>
>["checks"]["rows"][number];

const HISTORY_COLUMNS: McpTableColumn<HistoryCheck>[] = [
  { header: "keyword", value: (row) => row.keyword },
  { header: "device", value: (row) => row.device },
  { header: "position", value: (row) => row.position },
  { header: "url", value: (row) => row.url },
  { header: "checked", value: (row) => row.checkedAt },
  { header: "run status", value: (row) => row.runStatus },
];

const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD (UTC)");

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .describe("Rank tracker config ID (list them with get_rank_tracker)."),
  startDate: dateInput
    .optional()
    .describe("First day to include, YYYY-MM-DD (UTC). Defaults to all time."),
  endDate: dateInput
    .optional()
    .describe("Last day to include, YYYY-MM-DD (UTC). Defaults to today."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(HISTORY_MAX_LIMIT)
    .optional()
    .describe(`Checks per page (max ${HISTORY_MAX_LIMIT}, default 50).`),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Pagination offset into the check list, newest first."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getRankHistoryTool = {
  name: "get_rank_history",
  config: {
    title: "Get rank history",
    description:
      "Read-only rank check history for a tracker: every saved check (keyword, device, position, URL, timestamp) with its run's status, inside an optional startDate/endDate window (YYYY-MM-DD, UTC). Paginated with limit/offset. A null/— position means \"not found within the tracked SERP depth\" — a real result, not a failed check; keywords whose check failed leave no row and appear via the run's status/errorMessage in structuredContent.runs. Never triggers paid checks — use run_rank_tracker for a fresh check.",
    inputSchema,
    outputSchema: z
      .object({
        tracker: looseObjectOutputSchema,
        runs: z.array(looseObjectOutputSchema),
        checks: z.array(looseObjectOutputSchema),
        totalCount: z.number(),
        hasMore: z.boolean(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    const { config, checks, runs } = await getRankHistory(
      args.trackerId,
      args.projectId,
      { startDate: args.startDate, endDate: args.endDate, limit, offset },
    );

    const rows = checks.rows;
    const table = formatMcpTable(rows, HISTORY_COLUMNS);
    const hasMore = offset + rows.length < checks.totalCount;
    const failedRuns = runs.filter((run) => run.status === "failed");
    const rangeLabel =
      args.startDate || args.endDate
        ? `${args.startDate ?? "…"} → ${args.endDate ?? "today"}`
        : "all time";

    const lines: string[] = [
      `Rank history for ${config.domain} — ${checks.totalCount} checks from ${runs.length} runs (${rangeLabel}).`,
    ];
    if (failedRuns.length > 0) {
      const latest = failedRuns[0];
      lines.push(
        `${failedRuns.length} run(s) failed: ${latest.errorMessage ?? "unknown error"}.`,
      );
    }
    lines.push(table);
    lines.push(
      `Position "—" means not found inside the tracked top ${config.serpDepth} — a real result, not a failed check. Keyword checks that failed leave no row; the run entries carry those failures (keywordsChecked < keywordsTotal).`,
    );
    if (hasMore) {
      lines.push(
        `Showing ${offset + 1}–${offset + rows.length} of ${checks.totalCount} — call again with offset=${offset + rows.length}.`,
      );
    }
    const text =
      rows.length === 0
        ? `No saved rank checks for ${config.domain} (${rangeLabel}). Checks appear here after a run completes; a fully failed run contributes no rows (see structuredContent.runs).`
        : lines.join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking`,
      ),
      structuredContent: {
        tracker: config,
        runs,
        checks: rows,
        totalCount: checks.totalCount,
        hasMore,
      },
    });
  }),
};
