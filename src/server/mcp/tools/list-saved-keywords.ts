import type { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
} as const;

export const listSavedKeywordsTool = {
  name: "list_saved_keywords",
  config: {
    title: "List saved keywords",
    description:
      "Lists keywords saved to a project (with cached metrics like search volume, difficulty, CPC if available). Free — reads from OpenSEO's database, no DataForSEO call.",
    inputSchema,
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof inputSchema>>, context) => {
      const { rows } = await KeywordResearchService.getSavedKeywords({
        projectId: args.projectId,
      });
      const text =
        rows.length === 0
          ? "No saved keywords yet."
          : `Saved keywords (${rows.length}):\n` +
            rows
              .map(
                (r) =>
                  `- ${r.keyword}  vol:${r.searchVolume ?? "?"}  kd:${r.keywordDifficulty ?? "?"}  cpc:${r.cpc != null ? `$${r.cpc.toFixed(2)}` : "?"}`,
              )
              .join("\n");
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/saved`,
        ),
        structuredContent: { rows },
      });
    },
  ),
};
