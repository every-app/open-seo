import { z } from "zod";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .describe("Rank tracker ID from get_rank_tracker."),
  keywordIds: z
    .array(z.string().uuid())
    .min(1)
    .max(2000)
    .describe(
      "Tracking keyword IDs to remove. Use `trackingKeywordId` values returned by get_rank_tracker.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const removeRankTrackingKeywordsTool = {
  name: "remove_rank_tracking_keywords",
  config: {
    title: "Remove rank tracking keywords",
    description:
      "Stop tracking keywords by their trackingKeywordId. Uses no credits and preserves historical snapshots. Missing, stale, foreign, and repeated IDs are ignored; `removed` is the number actually deleted from this tracker.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        requested: z.number(),
        removed: z.number(),
        removedIds: z.array(z.string()),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await RankTrackingService.removeKeywords(
      args.trackerId,
      args.projectId,
      args.keywordIds,
    );
    const requested = args.keywordIds.length;
    return mcpResponse({
      text: `Removed ${result.removed} of ${requested} requested keyword ID${requested === 1 ? "" : "s"} from tracker ${args.trackerId}. Historical snapshots were preserved.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        trackerId: args.trackerId,
        requested,
        ...result,
      },
    });
  }),
};
