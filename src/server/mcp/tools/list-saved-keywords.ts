import { brand } from "@/shared/brand";
import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import type { SavedKeywordRow, SavedKeywordTagSummary } from "@/types/keywords";

// The app reads the full SavedKeywordRow through its own server functions. The
// MCP row includes the saved row ID for removal, while omitting timestamps,
// tag colors, and the monthly trend array to keep the response small.
const savedKeywordOutputSchema = z.looseObject({
  id: z.string(),
  keyword: z.string(),
  searchVolume: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
  cpc: z.number().nullable(),
  competition: z.number().nullable(),
  intent: z.string().nullable(),
  tags: z.array(z.string()),
});

function toMcpRow(
  row: SavedKeywordRow,
): z.infer<typeof savedKeywordOutputSchema> {
  return {
    id: row.id,
    keyword: row.keyword,
    searchVolume: row.searchVolume,
    keywordDifficulty: row.keywordDifficulty,
    cpc: row.cpc,
    competition: row.competition,
    intent: row.intent,
    tags: row.tags.map((tag) => tag.name),
  };
}

function toMcpTag(tag: SavedKeywordTagSummary) {
  return { name: tag.name, keywordCount: tag.keywordCount };
}

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
    description: `Lists keywords saved to a project (with cached metrics like search volume, difficulty, CPC, and tags if available). Uses no credits — reads from ${brand.name}'s database, no DataForSEO call. Each row includes its saved-keyword ID for remove_saved_keywords. Use tag filters when the user asks for a saved segment; multiple tags match ANY tag.`,
    inputSchema,
    outputSchema: z.looseObject({
      rows: z.array(savedKeywordOutputSchema),
      totalCount: z.number(),
      tags: z.array(
        z.looseObject({ name: z.string(), keywordCount: z.number() }),
      ),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
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
                return `- ${row.keyword}  id:${row.id}  vol:${row.searchVolume ?? "?"}  kd:${row.keywordDifficulty ?? "?"}  cpc:${row.cpc != null ? `$${row.cpc.toFixed(2)}` : "?"}${tagText}`;
              })
              .join("\n");
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/saved`,
        ),
        structuredContent: {
          rows: rows.map(toMcpRow),
          totalCount,
          tags: tags.map(toMcpTag),
        },
      });
    },
  ),
};
