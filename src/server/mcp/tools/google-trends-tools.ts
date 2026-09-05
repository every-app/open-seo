import { z } from "zod";
import { fetchGoogleTrend } from "@/server/lib/google/trends";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  keyword: z.string().min(1).max(200),
  geo: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe("Two-letter country code. Defaults to US."),
  timeframe: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "Google Trends timeframe, such as today 12-m or 2004-01-01 2026-01-01.",
    ),
} as const;

export const googleTrendsTool = {
  name: "search_google_trends",
  config: {
    title: "Search Google Trends",
    description:
      "Return relative Google Trends interest over time. Values are an index, not monthly search volume.",
    inputSchema,
    outputSchema: z.object({
      keyword: z.string(),
      geo: z.string(),
      timeframe: z.string(),
      points: z.array(z.object({ date: z.string(), value: z.number() })),
      relatedQueries: z.array(
        z.object({ query: z.string(), value: z.number() }),
      ),
      source: z.literal("google-trends"),
      interpretation: z.literal("relative-interest-index"),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof inputSchema>>, context) => {
      const result = await fetchGoogleTrend(args);
      return mcpResponse({
        text: `Google Trends signal for "${result.keyword}" (${result.geo}, ${result.timeframe}). Values are relative interest from 0-100, not search volume. Includes ${result.relatedQueries.length} related queries when available.`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/keywords`,
        ),
        structuredContent: result,
      });
    },
  ),
};
