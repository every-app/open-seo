import { z } from "zod";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  formatMcpTable,
  readPath,
  type McpTableColumn,
} from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

const RANK_RESULT_COLUMNS: McpTableColumn<unknown>[] = [
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
    return `Latest run: ${run.completedAt ?? run.lastCheckedAt ?? "completed"}`;
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
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getRankTrackerTool = {
  name: "get_rank_tracker",
  config: {
    title: "Get rank tracker",
    description:
      "Read-only access to rank tracker configs and their latest results. With `trackerId`, returns config + latest snapshot per keyword, including `trackingKeywordId` for removals. Without it, lists all trackers in the project. Uses no credits. Use create_rank_tracker when no tracker exists; then use add_rank_tracking_keywords, remove_rank_tracking_keywords, estimate_rank_tracker_cost, or run_rank_tracker to manage it. `lastCheckedAt` shows position freshness.",
    inputSchema,
    outputSchema: z
      .object({
        configs: z.array(looseObjectOutputSchema).optional(),
        config: looseObjectOutputSchema.optional(),
        results: z
          .object({
            rows: z.array(looseObjectOutputSchema),
            run: z
              .object({
                id: z.string(),
                lastCheckedAt: z.string().nullable(),
                completedAt: z.string().nullable(),
                status: z.enum(["pending", "running", "completed", "failed"]),
                errorMessage: z.string().nullable(),
              })
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
          : `Rank trackers (${configs.length}):\n` +
            configs
              .map(
                (c) =>
                  `- ${c.id}  ${c.domain}  loc:${c.locationCode}${c.locationName ? `  location:"${c.locationName}"` : ""}  schedule:${c.scheduleInterval}`,
              )
              .join("\n");
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
    const text = [
      `Tracker ${config.id} (${config.domain}${config.locationName ? `, ${config.locationName}` : ""}):`,
      `Schedule: ${config.scheduleInterval}, devices: ${config.devices}, depth: ${config.serpDepth}`,
      formatLatestRun(results.run),
      `Keywords (${results.rows.length}):`,
      results.rows.length === 0
        ? "No keywords tracked yet."
        : formatMcpTable(results.rows, RANK_RESULT_COLUMNS),
    ].join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: { config, results },
    });
  }),
};
