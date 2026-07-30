import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { explorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import {
  BRAND_LOOKUP_MAX_INPUT_LENGTH,
  brandLookupInputSchema,
  brandLookupResultSchema,
  promptExplorerInputSchema,
  promptExplorerModelSchema,
  promptExplorerResultSchema,
  PROMPT_EXPLORER_MAX_PROMPT_LENGTH,
  webSearchCountryCodeSchema,
  type PromptExplorerModel,
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

const baseInputSchema = {
  projectId: projectIdSchema,
  query: z
    .string()
    .trim()
    .min(1)
    .max(BRAND_LOOKUP_MAX_INPUT_LENGTH)
    .describe(
      "Brand name, keyword, or domain to look up (e.g. 'Semrush' or 'semrush.com').",
    ),
} as const;

type BaseArgs = z.infer<z.ZodObject<typeof baseInputSchema>>;

const visibilityInputSchema = {
  ...baseInputSchema,
  competitors: z
    .array(z.string().trim().min(1).max(BRAND_LOOKUP_MAX_INPUT_LENGTH))
    .max(5)
    .optional()
    .describe(
      "Up to 5 competitor brands/domains to compare Share of Voice against. Omit for mention counts only, with no comparison. Each named competitor runs an extra paid cross-aggregated lookup per platform.",
    ),
} as const;

type VisibilityArgs = z.infer<z.ZodObject<typeof visibilityInputSchema>>;

/**
 * Both tools below read the same underlying Brand Lookup result (shared
 * ChatGPT + Google AI Overview mentions fetch, R2-cached for 24h per
 * project/target/competitor set) and each project a different slice of it —
 * mirroring the split the dashboard doesn't need but two focused MCP tools
 * do, so an agent asking only "who's winning share of voice" doesn't also
 * have to receive every cited URL.
 *
 * `competitors` is only accepted by get_ai_search_visibility: passing it adds
 * a paid cross-aggregated Share-of-Voice call per platform, and
 * get_ai_search_cited_sources has nowhere to surface that data — accepting it
 * there would silently spend credits on a result the caller never sees.
 */
async function fetchBrandLookup(
  args: BaseArgs & { competitors?: string[] },
  billing: BillingCustomerContext,
) {
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
    inputSchema: visibilityInputSchema,
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
  handler: withMcpProjectAuth(async (args: VisibilityArgs, context) => {
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
      "Which URLs get cited as sources in ChatGPT and Google AI Overview answers about a brand, keyword, or domain, plus the underlying prompts/questions and the other brands mentioned alongside each one. Fixed to the US/en market, matching the dashboard's Brand Lookup page. Takes no competitors — it doesn't report Share of Voice, so it never runs the paid competitor comparison; use get_ai_search_visibility for that. Calls DataForSEO's LLM Mentions API — charges credits on a cache miss, then cached 24h per project/query.",
    inputSchema: baseInputSchema,
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
  handler: withMcpProjectAuth(async (args: BaseArgs, context) => {
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
        { q: args.query },
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

const promptResultsInputSchema = {
  projectId: projectIdSchema,
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(PROMPT_EXPLORER_MAX_PROMPT_LENGTH)
    .describe("The prompt/question to ask each model, verbatim."),
  models: z
    .array(promptExplorerModelSchema)
    .min(1)
    .max(4)
    .optional()
    .describe(
      "Which LLMs to ask: 'chat_gpt', 'claude', 'gemini', 'perplexity' (1-4, deduped). Each model is a separate paid call. Defaults to just 'chat_gpt' to keep an unspecified call cheap.",
    ),
  highlightBrand: z
    .string()
    .trim()
    .min(1)
    .max(BRAND_LOOKUP_MAX_INPUT_LENGTH)
    .optional()
    .describe(
      "Brand to check for in each answer and its citations. Sets brandMentioned per model result; omit to leave it null.",
    ),
  webSearch: z
    .boolean()
    .optional()
    .describe("Allow each model to use web search. Defaults to true."),
  webSearchCountryCode: webSearchCountryCodeSchema
    .optional()
    .describe(
      "ISO-2 country code for the web-search component of the answer (e.g. 'US', 'GB'). Affects results when webSearch is true.",
    ),
} as const;

type PromptResultsArgs = z.infer<z.ZodObject<typeof promptResultsInputSchema>>;

const DEFAULT_PROMPT_EXPLORER_MODELS: PromptExplorerModel[] = ["chat_gpt"];

async function fetchPromptResults(
  args: PromptResultsArgs,
  billing: BillingCustomerContext,
) {
  const input = promptExplorerInputSchema.parse({
    projectId: args.projectId,
    prompt: args.prompt,
    models: args.models ?? DEFAULT_PROMPT_EXPLORER_MODELS,
    highlightBrand: args.highlightBrand,
    webSearch: args.webSearch,
    webSearchCountryCode: args.webSearchCountryCode,
  });
  return explorePrompt(input, billing);
}

type ModelSummaryRow = {
  model: string;
  status: string;
  brandMentioned: string;
  citations: number | string;
  outputTokens: number | string | null;
};

const MODEL_SUMMARY_COLUMNS: McpTableColumn<ModelSummaryRow>[] = [
  { header: "model", value: (row) => row.model },
  { header: "status", value: (row) => row.status },
  { header: "brand mentioned", value: (row) => row.brandMentioned },
  { header: "citations", value: (row) => row.citations },
  { header: "output tokens", value: (row) => row.outputTokens },
];

export const getAiSearchPromptResultsTool = {
  name: "get_ai_search_prompt_results",
  config: {
    title: "Get AI Search prompt results",
    description:
      "Ask one prompt across up to 4 LLMs (ChatGPT, Claude, Gemini, Perplexity) and return each model's raw answer, citations, and follow-up fan-out queries — for inspecting exactly what an AI assistant says in response to a specific question, rather than aggregate visibility. For brand mention counts and Share of Voice, use get_ai_search_visibility instead. Each requested model is a separate paid DataForSEO call, cached 7 days per (model, prompt, web search settings) tuple; defaults to just 'chat_gpt' when models is omitted to keep an unspecified call cheap.",
    inputSchema: promptResultsInputSchema,
    outputSchema: promptExplorerResultSchema
      .extend(optionalMetaOutputSchema)
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PromptResultsArgs, context) => {
    const result = await fetchPromptResults(args, context.billing);
    const summaryRows: ModelSummaryRow[] = result.results.map((r) =>
      r.status === "success"
        ? {
            model: r.model,
            status: "success",
            brandMentioned:
              r.brandMentioned == null ? "—" : r.brandMentioned ? "yes" : "no",
            citations: r.citations.length,
            outputTokens: r.outputTokens,
          }
        : {
            model: r.model,
            status: "error",
            brandMentioned: "—",
            citations: "—",
            outputTokens: "—",
          },
    );
    const lines = [
      `Prompt: ${result.prompt}`,
      `Highlight brand: ${result.highlightBrand ?? "none"}`,
      "",
      formatMcpTable(summaryRows, MODEL_SUMMARY_COLUMNS),
    ];
    for (const modelResult of result.results) {
      lines.push("", `--- ${modelResult.model} ---`);
      if (modelResult.status === "error") {
        lines.push(`Error: ${modelResult.message}`);
        continue;
      }
      lines.push(modelResult.text || "(empty response)");
      if (modelResult.citations.length > 0) {
        lines.push(
          "Citations: " +
            modelResult.citations
              .map((c) => `${c.url} (${c.domain ?? "?"})`)
              .join(", "),
        );
      }
    }
    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/prompt-explorer`,
      ),
      structuredContent: result,
    });
  }),
};
