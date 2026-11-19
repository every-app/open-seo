import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  domains: z
    .array(z.string().min(1).max(2048))
    .min(1)
    .max(1000)
    .describe(
      "1-1000 domains (e.g. 'example.com'). A URL counts as its hostname.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

type DomainRank = { domain: string; rank: number | null };

const COLUMNS: McpTableColumn<DomainRank>[] = [
  { header: "domain", value: (row) => row.domain },
  { header: "rank (0-100)", value: (row) => row.rank },
];

function normalizeDomain(input: string) {
  try {
    return normalizeDomainInput(input, true);
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError("VALIDATION_ERROR", `"${input}": ${error.message}`);
    }
    throw error;
  }
}

export const getDomainRanksTool = {
  name: "get_domain_ranks",
  config: {
    title: "Get domain ranks",
    description:
      "Get the backlink rank (0-100) of up to 1,000 domains in one call. Use it to compare the strength of the sites in a SERP or a competitor list. A null rank means DataForSEO has no backlink data for the domain. Costs ~31 credits per call plus ~5 per 100 domains. Self-hosted deployments need the Backlinks API enabled on their DataForSEO account. For one domain's full backlink profile, use get_backlinks_overview.",
    inputSchema,
    outputSchema: z.looseObject({
      ranks: z.array(
        z.looseObject({ domain: z.string(), rank: z.number().nullable() }),
      ),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const domains = [...new Set(args.domains.map(normalizeDomain))];
    const items = await createDataforseoClient(
      context.billing,
    ).backlinks.bulkRanks({ targets: domains });
    const rankByDomain = new Map(
      items.map((item) => [item.target.toLowerCase(), item.rank ?? null]),
    );
    const ranks: DomainRank[] = domains.map((domain) => ({
      domain,
      rank: rankByDomain.get(domain) ?? null,
    }));
    return mcpResponse({
      text: `Backlink rank of ${ranks.length} domains:\n${formatMcpTable(ranks, COLUMNS)}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
      ),
      structuredContent: { ranks },
    });
  }),
};
