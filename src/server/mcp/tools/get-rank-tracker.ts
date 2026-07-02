import { z } from "zod";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
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

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
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
      "Read-only access to rank tracker configs and their latest results. With `trackerId`, returns config + latest snapshot per keyword. Without it, lists all trackers in the project. Uses no credits — reads from OpenSEO state, no DataForSEO call. To trigger a new check, use the dashboard.",
    inputSchema,
    outputSchema: z
      .object({
        configs: z.array(looseObjectOutputSchema).optional(),
        config: looseObjectOutputSchema.optional(),
        results: looseObjectOutputSchema.optional(),
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
      const configs = await RankTrackingRepository.getConfigsForProject(
        args.projectId,
      );
      const text =
        configs.length === 0
          ? "No rank trackers configured for this project."
          : `Rank trackers (${configs.length}):\n` +
            configs
              .map(
                (c) =>
                  `- ${c.id}  ${c.domain}  loc:${c.locationCode}  schedule:${c.scheduleInterval}`,
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

    const config = await RankTrackingRepository.getConfigById({
      configId: args.trackerId,
      projectId: args.projectId,
    });
    if (!config) {
      return mcpResponse({
        text: `Rank tracker ${args.trackerId} not found in project ${args.projectId}.`,
        meta: buildProjectMeta(context, args.projectId),
      });
    }
    const results = await getLatestResults(args.trackerId, args.projectId);
    const text = [
      `Tracker ${config.id} (${config.domain}):`,
      `Schedule: ${config.scheduleInterval}, devices: ${config.devices}, depth: ${config.serpDepth}`,
      `Latest run: ${results.run?.lastCheckedAt ?? "never"}`,
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
