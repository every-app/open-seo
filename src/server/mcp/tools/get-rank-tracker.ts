import { z } from "zod";
import { sortBy } from "remeda";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  formatMcpCell,
  formatMcpTable,
  readPath,
  type McpTableColumn,
} from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { googleSerpUrl } from "@/shared/google-serp-url";

const RANK_RESULT_COLUMNS: McpTableColumn<unknown>[] = [
  // Put the removal id before provider text that may be truncated.
  {
    header: "trackingKeywordId",
    value: (row) => readPath(row, "trackingKeywordId"),
  },
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  { header: "desktop", value: (row) => readPath(row, "desktop", "position") },
  {
    header: "prev (desktop)",
    value: (row) => readPath(row, "desktop", "previousPosition"),
  },
  { header: "mobile", value: (row) => readPath(row, "mobile", "position") },
  {
    header: "prev (mobile)",
    value: (row) => readPath(row, "mobile", "previousPosition"),
  },
  {
    header: "pinned",
    value: (row) => (readPath(row, "pinned") === true ? "yes" : "no"),
  },
  {
    // Both devices resolve to the same page in practice, so one column carries
    // whichever device actually ranked.
    header: "ranking url",
    value: (row) =>
      readPath(row, "desktop", "rankingUrl") ??
      readPath(row, "mobile", "rankingUrl"),
  },
  { header: "google serp", value: (row) => readPath(row, "googleSerpUrl") },
];

function formatLocation(code: unknown, name: unknown): string {
  const codeCell = formatMcpCell(code);
  return typeof name === "string" && name
    ? `${codeCell} · ${formatMcpCell(name)}`
    : codeCell;
}

const CONFIG_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "domain", value: (row) => readPath(row, "domain") },
  {
    // locationName is part of a tracker's uniqueness key — without it two city
    // trackers on the same domain and country are indistinguishable.
    header: "location",
    value: (row) =>
      formatLocation(
        readPath(row, "locationCode"),
        readPath(row, "locationName"),
      ),
  },
  { header: "lang", value: (row) => readPath(row, "languageCode") },
  { header: "devices", value: (row) => readPath(row, "devices") },
  { header: "depth", value: (row) => readPath(row, "serpDepth") },
  { header: "schedule", value: (row) => readPath(row, "scheduleInterval") },
  { header: "last checked", value: (row) => readPath(row, "lastCheckedAt") },
  { header: "skip reason", value: (row) => readPath(row, "lastSkipReason") },
  { header: "trackerId", value: (row) => readPath(row, "id") },
];

/**
 * `lastCheckedAt` comes from the newest snapshot, so a run that finished
 * without saving any (e.g. every keyword errored) would otherwise read
 * "never". Report the run's own state instead.
 */
function formatLatestRun(
  run: {
    status: "pending" | "running" | "completed" | "failed";
    completedAt: string | null;
    lastCheckedAt: string | null;
    errorMessage: string | null;
  } | null,
): string {
  if (!run) return "Latest run: never";
  if (run.status === "failed")
    return `Latest run: failed — ${run.errorMessage ?? "Unknown error"}`;
  if (run.status === "completed")
    return `Latest run: ${run.completedAt ?? run.lastCheckedAt ?? "completed"}${run.errorMessage ? ` — ${run.errorMessage}` : ""}`;
  return `Latest run: ${run.status}`;
}

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Rank tracker config ID. If omitted, lists all rank trackers in the project.",
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Keyword row offset when trackerId is provided. Defaults to 0."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      "Keyword rows per page when trackerId is provided. Defaults to 100. Lower this if the text is truncated.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getRankTrackerTool = {
  name: "get_rank_tracker",
  config: {
    title: "Get rank tracker",
    description:
      "Read-only access to rank tracker configs and their latest results. With `trackerId`, returns config + a page of latest snapshots (pinned keywords first), including `trackingKeywordId` for removals and pins, `pinned`, and `googleSerpUrl`, a live Google search for the tracked keyword, language, country, and city. Use offset/limit to read additional keywords. Without it, lists all trackers in the project. Uses no credits. Use create_rank_tracker when no tracker exists; then use add_rank_tracking_keywords, remove_rank_tracking_keywords, pin_rank_tracking_keywords, estimate_rank_tracker_cost, or run_rank_tracker to manage it. `lastCheckedAt` shows position freshness. A null position means the domain was not found in the results the check returned, which can be fewer than `serpDepth`, so it does not prove the domain ranks below `serpDepth`.",
    inputSchema,
    outputSchema: z
      .object({
        configs: z.array(looseObjectOutputSchema).optional(),
        config: looseObjectOutputSchema.optional(),
        results: z
          .object({
            rows: z.array(looseObjectOutputSchema),
            totalCount: z.number().int().nonnegative(),
            offset: z.number().int().nonnegative(),
            limit: z.number().int().positive(),
            nextOffset: z.number().int().nonnegative().nullable(),
            run: z
              .object({
                id: z.string(),
                lastCheckedAt: z.string().nullable(),
                completedAt: z.string().nullable(),
                status: z.enum(["pending", "running", "completed", "failed"]),
                errorMessage: z.string().nullable(),
              })
              // Cached client schemas must tolerate new run fields too;
              // passthrough on the parent results object is not recursive.
              .passthrough()
              .nullable(),
          })
          .passthrough()
          .optional(),
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
    if (!args.trackerId) {
      const configs = await RankTrackingService.getConfigs(args.projectId);
      const text =
        configs.length === 0
          ? "No rank trackers configured for this project."
          : `Rank trackers (${configs.length}):\n${formatMcpTable(
              configs,
              CONFIG_COLUMNS,
            )}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/rank-tracking`,
        ),
        structuredContent: { configs },
      });
    }

    const { config, results } = await RankTrackingService.getTracker(
      args.trackerId,
      args.projectId,
    );
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 100;
    // Pinned keywords first, as in the app's keyword table; the stable
    // tiebreakers keep offset pages from overlapping.
    const rows = sortBy(
      results.rows,
      (row) => (row.pinned ? 0 : 1),
      (row) => row.keyword,
      (row) => row.trackingKeywordId,
    )
      .slice(offset, offset + limit)
      .map((row) => ({
        ...row,
        googleSerpUrl: googleSerpUrl(row.keyword, config),
      }));
    const totalCount = results.rows.length;
    const nextOffset =
      offset + rows.length < totalCount ? offset + rows.length : null;
    const text = [
      `Tracker ${config.id} (${config.domain}):`,
      `Keyword page: offset=${offset}, limit=${limit}, ${rows.length} of ${totalCount} rows.${nextOffset !== null ? ` Next page: offset=${nextOffset}.` : ""} If text is truncated, repeat offset=${offset} with a smaller limit.`,
      `Schedule: ${config.scheduleInterval}, devices: ${config.devices}, depth: ${config.serpDepth}, location: ${formatLocation(config.locationCode, config.locationName)}, lang: ${config.languageCode}`,
      formatLatestRun(results.run),
      `Keywords (${totalCount}):`,
      totalCount === 0
        ? "No keywords tracked yet."
        : rows.length === 0
          ? "No keywords at this offset."
          : formatMcpTable(rows, RANK_RESULT_COLUMNS),
    ].join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        config,
        results: { ...results, rows, totalCount, offset, limit, nextOffset },
      },
    });
  }),
};
