import { z } from "zod";
import { sortBy } from "remeda";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .describe("Rank tracker config ID from get_rank_tracker."),
  device: z
    .enum(["desktop", "mobile"])
    .optional()
    .describe(
      "Device to read. Defaults to desktop, or mobile for a mobile-only tracker.",
    ),
  runs: z
    .number()
    .int()
    .min(1)
    .max(26)
    .optional()
    .describe(
      "How many of the latest completed checks to return. Defaults to 12.",
    ),
  trackingKeywordId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Only return this keyword's history. IDs come from get_rank_tracker.",
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Keyword row offset. Defaults to 0."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Keyword rows per page. Defaults to 100. Lower this if the text is truncated.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const historyPointSchema = z.object({
  runId: z.string(),
  checkedAt: z.string(),
  position: z.number().int().nullable(),
  checked: z.boolean(),
});

type HistoryPoint = z.infer<typeof historyPointSchema>;

type HistoryRow = {
  trackingKeywordId: string;
  keyword: string;
  pinned: boolean;
  history: HistoryPoint[];
};

function historyCell(point: HistoryPoint | undefined): string {
  // No point: the keyword was added after this check started.
  if (!point) return "";
  if (!point.checked) return "not checked";
  return point.position === null ? "—" : String(point.position);
}

export const getRankHistoryTool = {
  name: "get_rank_history",
  config: {
    title: "Get rank history",
    description:
      "Read the position history of a rank tracker's keywords over its latest completed checks (up to 26), newest first, for one device. A null position (— in text) means the domain was not found in the results that check returned; `checked: false` (not checked in text) means the check got no result for the keyword, so it says nothing about the position. Checks that only re-ran some keywords are left out. Uses no credits. Call get_rank_tracker first for the trackerId and trackingKeywordId values.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        domain: z.string(),
        device: z.enum(["desktop", "mobile"]),
        runs: z.array(
          z.object({ runId: z.string(), checkedAt: z.string() }).passthrough(),
        ),
        rows: z.array(
          z
            .object({
              trackingKeywordId: z.string(),
              keyword: z.string(),
              pinned: z.boolean(),
              history: z.array(historyPointSchema.passthrough()),
            })
            .passthrough(),
        ),
        totalCount: z.number().int().nonnegative(),
        offset: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        nextOffset: z.number().int().nonnegative().nullable(),
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
    const runLimit = args.runs ?? 12;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 100;

    const { config, device, keywords, cells } =
      await RankTrackingService.getPositionHistory({
        configId: args.trackerId,
        projectId: args.projectId,
        device: args.device,
        runLimit,
      });

    const runs = sortBy(
      [
        ...new Map(
          cells.map((cell) => [
            cell.runId,
            { runId: cell.runId, checkedAt: cell.checkedAt },
          ]),
        ).values(),
      ],
      [(run) => run.checkedAt, "desc"],
    );
    const runOrder = new Map(runs.map((run, index) => [run.runId, index]));
    const historyByKeyword = new Map<string, HistoryPoint[]>();
    for (const cell of cells) {
      const history = historyByKeyword.get(cell.trackingKeywordId) ?? [];
      history.push({
        runId: cell.runId,
        checkedAt: cell.checkedAt,
        position: cell.position,
        checked: cell.checked,
      });
      historyByKeyword.set(cell.trackingKeywordId, history);
    }

    const allRows: HistoryRow[] = sortBy(
      keywords.filter(
        (keyword) =>
          !args.trackingKeywordId || keyword.id === args.trackingKeywordId,
      ),
      (keyword) => (keyword.pinnedAt ? 0 : 1),
      (keyword) => keyword.keyword,
      (keyword) => keyword.id,
    ).map((keyword) => ({
      trackingKeywordId: keyword.id,
      keyword: keyword.keyword,
      pinned: keyword.pinnedAt !== null,
      history: sortBy(
        historyByKeyword.get(keyword.id) ?? [],
        (point) => runOrder.get(point.runId) ?? 0,
      ),
    }));
    if (args.trackingKeywordId && allRows.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "That keyword is not tracked by this tracker.",
      );
    }

    const rows = allRows.slice(offset, offset + limit);
    const totalCount = allRows.length;
    const nextOffset =
      offset + rows.length < totalCount ? offset + rows.length : null;

    const columns: McpTableColumn<HistoryRow>[] = [
      { header: "trackingKeywordId", value: (row) => row.trackingKeywordId },
      { header: "keyword", value: (row) => row.keyword },
      ...runs.map(
        (run): McpTableColumn<HistoryRow> => ({
          header: run.checkedAt.replace("T", " ").slice(0, 16),
          value: (row) =>
            historyCell(row.history.find((point) => point.runId === run.runId)),
          format: (value) => String(value),
        }),
      ),
    ];

    const text = [
      `Rank history for tracker ${config.id} (${config.domain}), ${device}, latest ${runs.length} completed check(s), newest first.`,
      `Keyword page: offset=${offset}, limit=${limit}, ${rows.length} of ${totalCount} rows.${nextOffset !== null ? ` Next page: offset=${nextOffset}.` : ""}`,
      "Cells: position; — = not found in the results; not checked = the check got no result; blank = not tracked yet.",
      runs.length === 0
        ? "No completed checks yet."
        : rows.length === 0
          ? "No keywords at this offset."
          : formatMcpTable(rows, columns),
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        trackerId: config.id,
        domain: config.domain,
        device,
        runs,
        rows,
        totalCount,
        offset,
        limit,
        nextOffset,
      },
    });
  }),
};
