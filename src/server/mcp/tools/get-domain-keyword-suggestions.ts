import { z } from "zod";
import { DomainService } from "@/server/features/domain/services/DomainService";
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
  domain: z
    .string()
    .min(1)
    .describe("Competitor or reference domain to extract keywords from."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getDomainKeywordSuggestionsTool = {
  name: "get_domain_keyword_suggestions",
  config: {
    title: "Get domain keyword opportunities",
    description:
      "Returns the organic keywords a domain ranks for, including position and available metrics. Use after get_domain_overview when you want the detailed keyword opportunity list for a competitor or reference domain. Charges credits (~100-300 typical). Cached for 12 hours.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const keywords = await DomainService.getSuggestedKeywords(
      {
        domain: args.domain,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        organizationId: context.auth.organizationId,
        projectId: args.projectId,
      },
      context.billing,
    );
    const text = [
      `Top keywords for ${args.domain} (${keywords.length}):`,
      ...keywords
        .slice(0, 25)
        .map(
          (kw) =>
            `- "${kw.keyword}" #${kw.position ?? "?"} vol:${kw.searchVolume ?? "?"} kd:${kw.keywordDifficulty ?? "?"}`,
        ),
    ].join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/domain`,
        {
          domain: args.domain,
        },
      ),
      structuredContent: { keywords },
    });
  }),
};
