import { z } from "zod";
import { RankTrackingKeywordService } from "@/server/features/rank-tracking/services/RankTrackingKeywordService";
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
      "Tracking keyword IDs to pin or unpin. Use `trackingKeywordId` values returned by get_rank_tracker.",
    ),
  pinned: z
    .boolean()
    .describe("true pins the keywords to the top. false unpins them."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const pinRankTrackingKeywordsTool = {
  name: "pin_rank_tracking_keywords",
  config: {
    title: "Pin rank tracking keywords",
    description:
      "Pin or unpin tracked keywords by their trackingKeywordId. Pinned keywords stay at the top of the tracker's keyword table for everyone in the project, and get_rank_tracker lists them first. Uses no credits. Missing, stale, foreign, and repeated IDs are ignored; `updated` is the number of keywords actually changed in this tracker.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        pinned: z.boolean(),
        requested: z.number(),
        updated: z.number(),
        updatedIds: z.array(z.string()),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await RankTrackingKeywordService.setKeywordsPinned(
      args.trackerId,
      args.projectId,
      args.keywordIds,
      args.pinned,
    );
    const requested = args.keywordIds.length;
    return mcpResponse({
      text: `${args.pinned ? "Pinned" : "Unpinned"} ${result.updated} of ${requested} requested keyword ID${requested === 1 ? "" : "s"} in tracker ${args.trackerId}.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        trackerId: args.trackerId,
        pinned: args.pinned,
        requested,
        ...result,
      },
    });
  }),
};
