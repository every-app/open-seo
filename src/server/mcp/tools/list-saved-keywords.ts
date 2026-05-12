import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Optional keyword text filter."),
  tags: z
    .array(z.string().min(1).max(64))
    .max(20)
    .optional()
    .describe("Optional tag-name filters. Multiple tags match ANY tag."),
  limit: z
    .union([z.literal(50), z.literal(100), z.literal(250)])
    .optional()
    .describe("Maximum rows to return. Defaults to 100."),
} as const;

export const listSavedKeywordsTool = {
  name: "list_saved_keywords",
  config: {
    title: "List saved keywords",
    description:
      "Lists keywords saved to a project (with cached metrics like search volume, difficulty, CPC, and tags if available). Free — reads from OpenSEO's database, no DataForSEO call. Use tag filters when the user asks for a saved segment; multiple tags match ANY tag.",
    inputSchema,
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof inputSchema>>, context) => {
      const { rows, totalCount, tags } =
        await KeywordResearchService.getSavedKeywords({
          projectId: args.projectId,
          search: args.search,
          tagNames: args.tags,
          page: 1,
          pageSize: args.limit ?? 100,
          sort: "createdAt",
          order: "desc",
        });
      const text =
        rows.length === 0
          ? "No saved keywords yet."
          : `Saved keywords (${rows.length} of ${totalCount}):\n` +
            rows
              .map((row) => {
                const tagText =
                  row.tags.length > 0
                    ? `  tags:${row.tags.map((tag) => tag.name).join(",")}`
                    : "";
                return `- ${row.keyword}  vol:${row.searchVolume ?? "?"}  kd:${row.keywordDifficulty ?? "?"}  cpc:${row.cpc != null ? `$${row.cpc.toFixed(2)}` : "?"}${tagText}`;
              })
              .join("\n");
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/saved`,
        ),
        structuredContent: { rows, totalCount, tags },
      });
    },
  ),
};
