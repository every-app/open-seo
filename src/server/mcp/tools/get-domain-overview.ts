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
  domain: z.string().min(1).describe("Domain to analyze (e.g. 'example.com')."),
  includeSubdomains: z.boolean().optional().default(false),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getDomainOverviewTool = {
  name: "get_domain_overview",
  config: {
    title: "Get domain overview",
    description:
      "Returns a high-level view of a domain's organic footprint: estimated organic traffic, organic keyword count, backlinks, and referring domains. Use this first for domain research; for the detailed ranked-keyword list, call get_domain_keyword_suggestions next. Charges credits (~100-300 typical). Cached for 12 hours per domain.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await DomainService.getOverview(
      {
        projectId: args.projectId,
        domain: args.domain,
        includeSubdomains: args.includeSubdomains,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      },
      context.billing,
    );
    const text = [
      `Domain: ${result.domain}`,
      `Organic traffic: ${result.organicTraffic ?? "?"}`,
      `Organic keywords: ${result.organicKeywords ?? "?"}`,
      `Backlinks: ${result.backlinks ?? "?"}`,
      `Referring domains: ${result.referringDomains ?? "?"}`,
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
      structuredContent: result,
    });
  }),
};
