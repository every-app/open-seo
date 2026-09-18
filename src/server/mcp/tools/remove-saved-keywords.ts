import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  savedKeywordIds: z
    .array(z.string().min(1))
    .min(1)
    .max(2000)
    .describe(
      "Saved-keyword row IDs to delete. Use the `id` values returned by list_saved_keywords.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const removeSavedKeywordsTool = {
  name: "remove_saved_keywords",
  config: {
    title: "Remove saved keywords",
    description:
      "Permanently deletes keywords from a project's saved-keywords list by their row ID. Uses no credits — does not call DataForSEO. This does not affect Rank Tracking; use remove_rank_tracking_keywords for that list separately.",
    inputSchema,
    outputSchema: z
      .object({
        projectId: z.string(),
        requested: z.number(),
        deletedCount: z.number(),
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
    const requested = args.savedKeywordIds.length;
    const result = await KeywordResearchService.removeSavedKeywords(
      args.projectId,
      { projectId: args.projectId, savedKeywordIds: args.savedKeywordIds },
    );
    return mcpResponse({
      text: `Deleted ${result.deletedCount} of ${requested} requested saved keyword${requested === 1 ? "" : "s"}.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/saved`,
      ),
      structuredContent: {
        projectId: args.projectId,
        requested,
        deletedCount: result.deletedCount,
      },
    });
  }),
};
