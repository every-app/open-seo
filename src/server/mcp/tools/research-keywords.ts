import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LOCATION_CODE,
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

const seedSchema = z.object({
  seed: z.string().min(1).describe("Seed keyword to research."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
});

const inputSchema = {
  projectId: projectIdSchema,
  seeds: z
    .array(seedSchema)
    .min(1)
    .max(5)
    .describe(
      "1-5 seed keywords. Each seed is researched independently and returns related keywords with volume/difficulty/CPC. Bulk-friendly — prefer this over multiple single-seed calls.",
    ),
  resultLimit: z
    .union([z.literal(150), z.literal(300), z.literal(500)])
    .optional()
    .describe("Max keywords returned per seed. Defaults to 150."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const researchKeywordsTool = {
  name: "research_keywords",
  config: {
    title: "Research keywords (bulk)",
    description:
      "Research keyword data (search volume, difficulty, CPC, related ideas) for 1-5 seed keywords in one call. Charges credits per seed (~50-200 credits each, varies by source). Returns per-seed results — a single bad seed won't fail the batch.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const results = await Promise.all(
      args.seeds.map(async (item) => {
        try {
          const data = await KeywordResearchService.research(
            {
              projectId: args.projectId,
              keywords: [item.seed],
              locationCode: item.locationCode ?? DEFAULT_LOCATION_CODE,
              languageCode: item.languageCode ?? DEFAULT_LANGUAGE_CODE,
              resultLimit: args.resultLimit ?? 150,
              mode: "auto",
            },
            context.billing,
          );
          return {
            seed: item.seed,
            ok: true as const,
            rowCount: data.rows.length,
            source: data.source,
            usedFallback: data.usedFallback,
            topRows: data.rows.slice(0, 20),
          };
        } catch (error) {
          return {
            seed: item.seed,
            ok: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const text =
      results
        .map((r) => {
          if (r.ok) {
            return `- "${r.seed}": ${r.rowCount} keywords (source: ${r.source})`;
          }
          return `- "${r.seed}": FAILED — ${r.error}`;
        })
        .join("\n") +
      `\n\nResearched ${okCount} of ${results.length} seeds${failCount > 0 ? ` (${failCount} failed)` : ""}.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { results },
    });
  }),
};
