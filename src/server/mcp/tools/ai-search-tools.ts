import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import {
  BRAND_LOOKUP_MAX_INPUT_LENGTH,
  brandLookupInputSchema,
  brandLookupResultSchema,
} from "@/types/schemas/ai-search";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

// Brand Lookup only ever queries US/en (2840/"en") today — that's what the
// dashboard's Brand Lookup page hardcodes, and DataForSEO's ChatGPT mentions
// data is US/en-only regardless of what's requested. Keeping the same fixed
// market here avoids exposing an MCP surface the product doesn't otherwise
// support or test.
const BRAND_LOOKUP_LOCATION_CODE = 2840;
const BRAND_LOOKUP_LANGUAGE_CODE = "en";

const inputSchema = {
  projectId: projectIdSchema,
  query: z
    .string()
    .trim()
    .min(1)
    .max(BRAND_LOOKUP_MAX_INPUT_LENGTH)
    .describe(
      "Brand name, keyword, or domain to look up (e.g. 'Semrush' or 'semrush.com').",
    ),
  competitors: z
    .array(z.string().trim().min(1).max(BRAND_LOOKUP_MAX_INPUT_LENGTH))
    .max(5)
    .optional()
    .describe(
      "Up to 5 competitor brands/domains to compare Share of Voice against. Omit for mention counts only, with no comparison.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

/**
 * Both tools below read the same underlying Brand Lookup result (shared
 * ChatGPT + Google AI Overview mentions fetch, R2-cached for 24h per
 * project/target/competitor set) and each project a different slice of it —
 * mirroring the split the dashboard doesn't need but two focused MCP tools
 * do, so an agent asking only "who's winning share of voice" doesn't also
 * have to receive every cited URL.
 */
async function fetchBrandLookup(args: Args, billing: BillingCustomerContext) {
  const input = brandLookupInputSchema.parse({
    projectId: args.projectId,
    query: args.query,
    competitors: args.competitors,
    locationCode: BRAND_LOOKUP_LOCATION_CODE,
    languageCode: BRAND_LOOKUP_LANGUAGE_CODE,
  });
  return getBrandLookup(input, billing);
}

const PLATFORM_COLUMNS: McpTableColumn<{
  platform: string;
  status: string;
  mentions: number | null;
  aiSearchVolume: number | null;
}>[] = [
  { header: "platform", value: (row) => row.platform },
  { header: "status", value: (row) => row.status },
  { header: "mentions", value: (row) => row.mentions },
  { header: "AI search volume", value: (row) => row.aiSearchVolume },
];

export const getAiSearchVisibilityTool = {
  name: "get_ai_search_visibility",
  config: {
    title: "Get AI Search visibility",
    description:
      "Brand mention counts and AI search volume for a brand, keyword, or domain across ChatGPT and Google AI Overview, plus Share of Voice against up to 5 named competitors. Fixed to the US/en market, matching the dashboard's Brand Lookup page. Calls DataForSEO's LLM Mentions API — charges credits on a cache miss, then cached 24h per project/query/competitor set. For the URLs cited as sources, use get_ai_search_cited_sources instead.",
    inputSchema,
    outputSchema: brandLookupResultSchema
      .omit({ topPages: true, topQueries: true })
      .extend(optionalMetaOutputSchema)
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await fetchBrandLookup(args, context.billing);
    const lines = [
      `Query: ${result.query} (detected ${result.detectedTargetType}: ${result.resolvedTarget})`,
      result.hasData
        ? `Total mentions: ${result.totalMentions ?? "?"}, AI search volume: ${result.totalAiSearchVolume ?? "?"}`
        : "No AI Search data found for this target.",
      "",
      "By platform:",
      formatMcpTable(result.perPlatform, PLATFORM_COLUMNS),
    ];
    if (result.shareOfVoice) {
      lines.push(
        "",
        `Share of Voice (${result.shareOfVoice.platforms.join(", ")}):`,
        formatMcpTable(result.shareOfVoice.entries, [
          {
            header: "label",
            value: (row) =>
              row.isTarget ? `${row.label} (target)` : row.label,
          },
          { header: "mentions", value: (row) => row.mentions },
          { header: "share %", value: (row) => row.sharePct },
        ]),
      );
    } else if (args.competitors?.length) {
      lines.push(
        "",
        "Share of Voice unavailable (both platform calls failed for the competitor comparison).",
      );
    }
    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/brand-lookup`,
        { q: args.query, c: args.competitors?.join(",") },
      ),
      structuredContent: {
        query: result.query,
        detectedTargetType: result.detectedTargetType,
        resolvedTarget: result.resolvedTarget,
        fetchedAt: result.fetchedAt,
        hasData: result.hasData,
        totalMentions: result.totalMentions,
        totalAiSearchVolume: result.totalAiSearchVolume,
        perPlatform: result.perPlatform,
        shareOfVoice: result.shareOfVoice,
        monthlyVolume: result.monthlyVolume,
      },
    });
  }),
};

const CITED_PAGE_COLUMNS: McpTableColumn<{
  url: string;
  platform: string;
  mentions: number | null;
  capturedVolume: number | null;
}>[] = [
  { header: "url", value: (row) => row.url },
  { header: "platform", value: (row) => row.platform },
  { header: "mentions", value: (row) => row.mentions },
  { header: "AI search volume", value: (row) => row.capturedVolume },
];

export const getAiSearchCitedSourcesTool = {
  name: "get_ai_search_cited_sources",
  config: {
    title: "Get AI Search cited sources",
    description:
      "Which URLs get cited as sources in ChatGPT and Google AI Overview answers about a brand, keyword, or domain, plus the underlying prompts/questions and the other brands mentioned alongside each one. Fixed to the US/en market, matching the dashboard's Brand Lookup page. Calls DataForSEO's LLM Mentions API — charges credits on a cache miss, then cached 24h per project/query/competitor set. For mention counts and Share of Voice, use get_ai_search_visibility instead.",
    inputSchema,
    outputSchema: brandLookupResultSchema
      .pick({
        query: true,
        detectedTargetType: true,
        resolvedTarget: true,
        fetchedAt: true,
        hasData: true,
        topPages: true,
        topQueries: true,
      })
      .extend(optionalMetaOutputSchema)
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await fetchBrandLookup(args, context.billing);
    const lines = [
      `Query: ${result.query} (detected ${result.detectedTargetType}: ${result.resolvedTarget})`,
      "",
      `Cited pages (${result.topPages.length}):`,
      result.topPages.length === 0
        ? "No cited pages found."
        : formatMcpTable(result.topPages, CITED_PAGE_COLUMNS),
      "",
      `Prompts sampled (${result.topQueries.length}):`,
      result.topQueries.length === 0
        ? "No prompts found."
        : formatMcpTable(result.topQueries, [
            { header: "question", value: (row) => row.question },
            { header: "platform", value: (row) => row.platform },
            {
              header: "cited domains",
              value: (row) =>
                row.citedSources.map((s) => s.domain ?? s.url).join(", "),
            },
          ]),
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/brand-lookup`,
        { q: args.query, c: args.competitors?.join(",") },
      ),
      structuredContent: {
        query: result.query,
        detectedTargetType: result.detectedTargetType,
        resolvedTarget: result.resolvedTarget,
        fetchedAt: result.fetchedAt,
        hasData: result.hasData,
        topPages: result.topPages,
        topQueries: result.topQueries,
      },
    });
  }),
};
