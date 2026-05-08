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
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const saveKeywordsTool = {
  name: "save_keywords",
  config: {
    title: "Save keywords",
    description:
      "Save keywords to a project's saved-keywords list. Free — does not call DataForSEO. Idempotent: re-saving an existing keyword is a no-op.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    await KeywordResearchService.saveKeywords({
      projectId: args.projectId,
      keywords: args.keywords,
      locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
      languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
    });
    return mcpResponse({
      text: `Saved ${args.keywords.length} keyword(s) to project ${args.projectId}.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/saved`,
      ),
    });
  }),
};
