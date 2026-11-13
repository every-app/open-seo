import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { updateAiResearchKeywordsSchema } from "@/types/schemas/aiPromptResearch";

type Args = z.infer<typeof updateAiResearchKeywordsSchema>;

export const updateAiResearchKeywordsTool = {
  name: "update_ai_research_keywords",
  config: {
    title: "Update Prompt Research keywords",
    description:
      "Edit a project's saved Prompt Research keywords, the shortcuts listed on the Prompt Research page: remove takes keywords off the list and add puts new ones on it, so one call swaps keywords. Call it with neither to read the list. Returns keywords, the list Prompt Research now shows, and trackedTopics, the tracker topics among them. Tracked topics are always listed; change those with save_ai_visibility_tracker. Uses no credits and starts no research.",
    inputSchema: updateAiResearchKeywordsSchema.shape,
    outputSchema: z.looseObject({
      keywords: z.array(z.string()),
      trackedTopics: z.array(z.string()),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    // Like the other AI visibility tools, keep the service and its provider
    // clients out of the MCP and SAM startup graph.
    const { AiVisibilityService } =
      await import("@/server/features/ai-visibility/services/AiVisibilityService");
    const list = await AiVisibilityService.updateResearchKeywords(args);
    return mcpResponse({
      text: `Prompt Research lists ${list.keywords.length} keywords${list.keywords.length ? `: ${list.keywords.join(", ")}` : ""}.${
        list.trackedTopics.length
          ? ` Tracked topics are always listed (${list.trackedTopics.join(", ")}); change them with save_ai_visibility_tracker.`
          : ""
      }`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/ai-visibility/research`,
      ),
      structuredContent: list,
    });
  }),
};
