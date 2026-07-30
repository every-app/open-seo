import { z } from "zod";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .min(1)
    .describe(
      "Rank tracker config ID from get_rank_tracker (the `id` on each config).",
    ),
  keywordIds: z
    .array(z.string().uuid())
    .min(1)
    .max(2000)
    .describe(
      "Tracking keyword IDs to remove. Get `trackingKeywordId` values from get_rank_tracker structured results.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const removeRankTrackingKeywordsTool = {
  name: "remove_rank_tracking_keywords",
  config: {
    title: "Remove rank tracking keywords",
    description:
      "Remove tracked keywords from a rank tracker by ID. Uses no credits. Pass `trackingKeywordId` values from get_rank_tracker (structured results.rows). Does not delete historical snapshots.",
    inputSchema,
    outputSchema: {
      projectId: z.string(),
      trackerId: z.string(),
      removed: z.number(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    await RankTrackingService.removeKeywords(
      args.trackerId,
      args.projectId,
      args.keywordIds,
    );
    return mcpResponse({
      text: `Removed ${args.keywordIds.length} keyword${args.keywordIds.length === 1 ? "" : "s"} from tracker ${args.trackerId}.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        projectId: args.projectId,
        trackerId: args.trackerId,
        removed: args.keywordIds.length,
      },
    });
  }),
};
