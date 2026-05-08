import { z } from "zod";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
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
      "Returns a backlinks profile summary (total backlinks, referring domains, top referring domains). Charges credits (~200-500 typical). Requires that the user's DataForSEO account has Backlinks enabled.",
    inputSchema,
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const lookup = { target: args.target, scope: args.scope };
    const spamOptions = { hideSpam: args.hideSpam ?? true };
    const [overview, refDomains] = await Promise.all([
      BacklinksService.profileOverview(lookup, context.billing, spamOptions),
      BacklinksService.profileReferringDomains(
        lookup,
        context.billing,
        spamOptions,
      ),
    ]);
    const topDomains = refDomains.rows ?? [];
    const overviewRecord =
      overview && typeof overview === "object"
        ? (overview as Record<string, unknown>)
        : {};
    const text = [
      `Backlinks profile for ${args.target} (${args.scope ?? "domain"}):`,
      `- backlinks: ${formatMetric(overviewRecord.backlinks)}`,
      `- referring domains: ${formatMetric(overviewRecord.referring_domains)}`,
      `- referring pages: ${formatMetric(overviewRecord.referring_pages)}`,
      `- rank: ${formatMetric(overviewRecord.rank)}`,
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
