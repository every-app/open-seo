import { z } from "zod";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  target: z
    .string()
    .min(1)
    .describe(
      "Domain or URL to analyze (e.g. 'example.com' or 'https://example.com/blog').",
    ),
  scope: z
    .enum(["domain", "page"])
    .optional()
    .describe(
      "'domain' analyzes the whole domain; 'page' analyzes a specific URL. Defaults to 'domain'.",
    ),
  hideSpam: z
    .boolean()
    .optional()
    .describe("Filter out spammy referring domains. Defaults to true."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function formatMetric(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? value : "?";
}

export const getBacklinksOverviewTool = {
  name: "get_backlinks_overview",
  config: {
    title: "Get backlinks overview",
    description:
      "Returns a backlinks profile summary (total backlinks, referring domains, top referring domains). Charges credits (~200-500 typical). Self-hosted deployments need the Backlinks API enabled on their DataForSEO account.",
    inputSchema,
    outputSchema: {
      overview: looseObjectOutputSchema,
      referringDomains: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const lookup = { target: args.target, scope: args.scope };
    const spamOptions = { hideSpam: args.hideSpam ?? true };
    const [overview, refDomains] = await Promise.all([
      BacklinksService.profileOverview(lookup, context.billing),
      BacklinksService.profileReferringDomainsPage(
        {
          ...lookup,
          page: 1,
          pageSize: 100,
          sortField: "backlinks",
          sortOrder: "desc",
          filters: {},
        },
        context.billing,
        spamOptions,
      ),
    ]);
    const topDomains = refDomains.rows ?? [];
    const summary = overview.overview.summary;
    const text = [
      `Backlinks profile for ${args.target} (${args.scope ?? "domain"}):`,
      `- backlinks: ${formatMetric(summary.backlinks)}`,
      `- referring domains: ${formatMetric(summary.referringDomains)}`,
      `- referring pages: ${formatMetric(summary.referringPages)}`,
      `- rank: ${formatMetric(summary.rank)}`,
      "",
      `Top referring domains (${Math.min(topDomains.length, 10)} shown):`,
      ...topDomains
        .slice(0, 10)
        .map((d) => `- ${d.domain ?? "?"}  backlinks:${d.backlinks ?? "?"}`),
    ].join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
        { target: args.target },
      ),
      structuredContent: { overview, referringDomains: refDomains },
    });
  }),
};
