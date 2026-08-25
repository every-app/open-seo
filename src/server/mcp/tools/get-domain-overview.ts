import { z } from "zod";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveLabsMarket } from "@/shared/keyword-locations";
import {
  assertLabsLocationCode,
  assertLanguageForLocation,
} from "@/server/lib/market";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import {
  RESEARCH_SCOPE_PARAM_DESCRIPTION,
  researchScopeSchema,
} from "@/shared/researchScope";

const inputSchema = {
  projectId: projectIdSchema,
  domain: z
    .string()
    .min(1)
    .max(2048)
    .describe("Domain or URL to analyze (e.g. 'example.com')."),
  scope: researchScopeSchema
    .optional()
    .describe(
      `${RESEARCH_SCOPE_PARAM_DESCRIPTION} Overview metrics always cover the hostname plus subdomains; narrower scopes are labeled accordingly — use get_ranked_keywords with a scope for scoped keyword data.`,
    ),
  includeSubdomains: z
    .boolean()
    .optional()
    .describe("Deprecated: use scope ('subdomains' or 'domain') instead."),
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
    outputSchema: z
      .object({
        domain: z.string().optional(),
        scope: researchScopeSchema.optional(),
        displayTarget: z.string().optional(),
        organicTraffic: z.number().nullable().optional(),
        organicKeywords: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
        referringDomains: z.number().nullable().optional(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const { locationCode, languageCode } = resolveLabsMarket(
      args,
      context.project,
    );
    assertLabsLocationCode(locationCode);
    assertLanguageForLocation(locationCode, languageCode);
    const scope =
      args.scope ??
      (args.includeSubdomains == null
        ? undefined
        : args.includeSubdomains
          ? "subdomains"
          : "domain");
    const result = await DomainService.getOverview(
      {
        projectId: args.projectId,
        domain: args.domain,
        scope,
        locationCode,
        languageCode,
      },
      context.billing,
    );
    const text = [
      `Target: ${result.displayTarget} (scope: ${result.scope})`,
      `Organic traffic: ${result.organicTraffic ?? "?"}`,
      `Organic keywords: ${result.organicKeywords ?? "?"}`,
      `Backlinks: ${result.backlinks ?? "?"}`,
      `Referring domains: ${result.referringDomains ?? "?"}`,
      ...(result.scope === "subdomains"
        ? []
        : [
            "Note: overview metrics cover the whole domain including subdomains; use get_ranked_keywords with this scope for scoped keyword data.",
          ]),
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
