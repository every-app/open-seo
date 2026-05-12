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

const inputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe("Keywords to save (1-100)."),
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
      "Save keywords to a project's saved-keywords list. Free — does not call DataForSEO. Idempotent: re-saving an existing keyword is a no-op. If tags are provided, missing tags may be created. By default tags are appended; set tagMode=replace to remove existing tags from these saved keywords before applying the provided tags, which is useful for reorganizing keywords into page/topic clusters. Ask the user for confirmation before applying or replacing tags broadly.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    if (args.tagMode === "replace" && (args.tags?.length ?? 0) === 0) {
      throw new Error("Replacement tags are required when tagMode is replace.");
    }

    const locationCode = args.locationCode ?? DEFAULT_LOCATION_CODE;
    const languageCode = args.languageCode ?? DEFAULT_LANGUAGE_CODE;

    await KeywordResearchService.saveKeywords({
      projectId: args.projectId,
      keywords: args.keywords,
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

    return mcpResponse({
      text: `Saved ${args.keywords.length} keyword(s)${tagText} to project ${args.projectId}.${modeText}`,
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
