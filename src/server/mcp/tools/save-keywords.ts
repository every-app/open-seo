import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import { savedKeywordMetricSchema } from "@/types/schemas/keywords";

const inputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe("Keywords to save (1-100)."),
  metrics: z
    .array(savedKeywordMetricSchema)
    .max(100)
    .optional()
    .describe(
      "Optional metrics for the saved keywords. Copy keyword, searchVolume, keywordDifficulty, cpc, competition, and intent from research_keywords or get_keyword_metrics rows. monthlySearches is optional. Match each metric using its keyword field.",
    ),
  tags: z
    .array(z.string().min(1).max(64))
    .max(20)
    .optional()
    .describe(
      "Optional tags to attach to every saved keyword. Ask the user for explicit confirmation before using this, especially when saving many keywords or creating new tag names.",
    ),
  tagMode: z
    .enum(["append", "replace"])
    .optional()
    .describe(
      "How to apply tags. Defaults to append. Use replace to remove existing tags from these saved keywords before applying the provided tags.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const saveKeywordsTool = {
  name: "save_keywords",
  config: {
    title: "Save keywords",
    description:
      "Save keywords to a project's saved-keywords list, optionally with metrics and tags. Re-saving an existing keyword is a no-op. Tags are appended by default; tagMode=replace removes the keywords' existing tags first, which is useful for regrouping keywords into page or topic clusters. Ask the user for confirmation before applying or replacing tags broadly. Uses no credits. To track rankings for keywords, use add_rank_tracking_keywords.",
    inputSchema,
    outputSchema: z.looseObject({
      projectId: z.string(),
      savedCount: z.number(),
      keywords: z.array(z.string()),
      tags: z.array(z.string()),
      tagMode: z.enum(["append", "replace"]),
      locationCode: z.number(),
      languageCode: z.string(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    if (args.tagMode === "replace" && (args.tags?.length ?? 0) === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Replacement tags are required when tagMode is replace.",
      );
    }

    const { locationCode, languageCode } = resolveMarket(args, context.project);

    await KeywordResearchService.saveKeywords({
      organizationId: context.auth.organizationId,
      projectId: args.projectId,
      keywords: args.keywords,
      metrics: args.metrics,
      tags: args.tags,
      tagMode: args.tagMode ?? "append",
      locationCode,
      languageCode,
    });

    const tagText =
      args.tags && args.tags.length > 0
        ? ` with tag(s): ${args.tags.join(", ")}`
        : "";
    const modeText = args.tagMode === "replace" ? " Replaced tags." : "";
    const trackers = await RankTrackingService.getConfigs(args.projectId);
    const trackingText =
      trackers.length === 0
        ? " If the user wants their rankings tracked, create_rank_tracker sets up a tracker."
        : " If the user wants their rankings tracked, add_rank_tracking_keywords adds them to a tracker.";

    return mcpResponse({
      text: `Saved ${args.keywords.length} keyword(s)${tagText} to project ${args.projectId}.${modeText}${trackingText}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/saved`,
      ),
      structuredContent: {
        projectId: args.projectId,
        savedCount: args.keywords.length,
        keywords: args.keywords,
        tags: args.tags ?? [],
        tagMode: args.tagMode ?? "append",
        locationCode,
        languageCode,
      },
    });
  }),
};
