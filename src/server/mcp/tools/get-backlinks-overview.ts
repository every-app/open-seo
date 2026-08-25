import { z } from "zod";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  formatMcpTable,
  readPath,
  type McpTableColumn,
} from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  BACKLINKS_SCOPE_DESCRIPTION,
  backlinksScopeWithLegacySchema,
  resolveBacklinksScope,
} from "@/types/schemas/backlinks";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseo";
import { researchScopeSchema } from "@/shared/researchScope";

const REFERRING_DOMAIN_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "domain", value: (row) => readPath(row, "domain") },
  { header: "backlinks", value: (row) => readPath(row, "backlinks") },
  {
    header: "referring pages",
    value: (row) => readPath(row, "referringPages"),
  },
  { header: "rank", value: (row) => readPath(row, "rank") },
];

const inputSchema = {
  projectId: projectIdSchema,
  target: z
    .string()
    .min(1)
    .describe(
      "Domain or URL to analyze (e.g. 'example.com' or 'https://example.com/blog').",
    ),
  scope: backlinksScopeWithLegacySchema
    .optional()
    .describe(BACKLINKS_SCOPE_DESCRIPTION),
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
      "Returns a backlinks profile summary (total backlinks, referring domains, top referring domains). Charges credits (~50 typical for a domain, ~25 for a single page). Note: bare domains default to scope 'subdomains'; pass scope 'domain' to exclude subdomains from the totals. Targets with a path default to 'subfolder', whose counts come from filtered backlink totals (no rank/trends/referring-domain breakdown). Trend data always includes subdomains (provider limitation). Self-hosted deployments need the Backlinks API enabled on their DataForSEO account.",
    inputSchema,
    outputSchema: {
      target: z.string(),
      scope: researchScopeSchema,
      scopeNote: z.string().optional(),
      overview: looseObjectOutputSchema,
      referringDomains: looseObjectOutputSchema.optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const lookup = {
      target: args.target,
      scope: args.scope ? resolveBacklinksScope(args.scope) : undefined,
    };
    const spamOptions = { hideSpam: args.hideSpam ?? true };
    // referring_domains has no URL filter, so the per-domain breakdown is
    // skipped for subfolder scope (the referring-domain count in the summary
    // is still subfolder-accurate).
    const resolvedScope = normalizeBacklinksTarget(args.target, {
      scope: lookup.scope,
    }).scope;
    const [overview, refDomains] = await Promise.all([
      BacklinksService.profileOverview(lookup, context.billing),
      resolvedScope === "subfolder"
        ? Promise.resolve(null)
        : BacklinksService.profileReferringDomainsPage(
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
    const topDomains = refDomains?.rows ?? [];
    const summary = overview.overview.summary;
    const { displayTarget, scope } = overview.overview;
    // backlinks/history has no include_subdomains, so trend series stay
    // subdomain-inclusive even when the summary excludes subdomains.
    const scopeNote =
      scope === "domain"
        ? "Summary excludes subdomains; trend data includes subdomains (provider limitation)."
        : scope === "subfolder"
          ? "Counts are computed from filtered backlink totals; rank, trends, and the referring-domains breakdown aren't available for subfolders."
          : undefined;
    const text = [
      `Backlinks profile for ${displayTarget} (scope: ${scope}):`,
      ...(scopeNote ? [`Note: ${scopeNote}`] : []),
      `- backlinks: ${formatMetric(summary.backlinks)}`,
      `- referring domains: ${formatMetric(summary.referringDomains)}`,
      `- referring pages: ${formatMetric(summary.referringPages)}`,
      `- rank: ${formatMetric(summary.rank)}`,
      "",
      refDomains === null
        ? "Referring-domains breakdown unavailable for subfolder scope."
        : topDomains.length === 0
          ? "No referring domains found."
          : `Referring domains (${topDomains.length}):\n${formatMcpTable(topDomains, REFERRING_DOMAIN_COLUMNS)}`,
    ].join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
        { target: args.target, scope },
      ),
      structuredContent: {
        target: displayTarget,
        scope,
        scopeNote,
        overview,
        referringDomains: refDomains ?? undefined,
      },
    });
  }),
};
