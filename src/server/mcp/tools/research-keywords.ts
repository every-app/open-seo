import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { recordResearchStep } from "@/server/features/activation/researchActivation";
import type { EnrichedKeyword } from "@/server/features/keywords/services/research/helpers";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import {
  formatMcpTable,
  sectionTableBudget,
  type McpTableColumn,
} from "@/server/mcp/table";
import { assertLanguageForLocation } from "@/server/lib/market";
import { toolErrorMessage } from "@/server/mcp/tool-error-message";
import {
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  LOCAL_VOLUME_COST_USD,
  applyBillingMarkupUsd,
} from "@/shared/billing";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

const LOCAL_VOLUME_CREDITS = Math.ceil(
  applyBillingMarkupUsd(LOCAL_VOLUME_COST_USD) *
    AUTUMN_SEO_DATA_CREDITS_PER_USD,
);

const seedSchema = z.object({
  seed: z
    .string()
    .min(1)
    .describe(
      'Seed keyword to research. Use * as a wildcard for any word or words: "best * for dogs" returns only keywords matching that pattern (e.g. "best flea treatment for dogs"), one request at about the same cost. Wildcards need at least one other word and are unavailable for countries served from Google Ads data.',
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  locationName: z
    .string()
    .min(1)
    .optional()
    .describe(
      `Optional city, county, or region inside the seed's country, for local search volume. Call search_serp_locations first and pass its locationName verbatim. Volume, CPC, and competition then come from Google Ads for that area; keyword ideas, KD, and intent stay national. Adds ~${LOCAL_VOLUME_CREDITS} credits per seed.`,
    ),
});

const inputSchema = {
  projectId: projectIdSchema,
  seeds: z
    .array(seedSchema)
    .min(1)
    .max(5)
    .describe(
      "1-5 seed keywords. Each seed is researched independently and returns related keywords with volume/difficulty/CPC. Bulk-friendly — prefer this over multiple single-seed calls.",
    ),
  resultLimit: z
    .union([z.literal(150), z.literal(300), z.literal(500)])
    .optional()
    .describe(
      "Max keywords returned per seed. Defaults to 150. Auto mode blends two sources; duplicate keywords across sources appear once.",
    ),
  includeClickstreamData: z
    .boolean()
    .optional()
    .describe(
      "Refine search volumes with clickstream data, which disaggregates Google Ads' grouped close-variant volumes (plurals/misspellings). DOUBLES the credit cost of each seed. Default false (standard Google-Ads-derived volumes). No effect for countries served from Google Ads data.",
    ),
  groupKeywords: z
    .boolean()
    .optional()
    .describe(
      "Include similar keyword variants that can share volume, CPC, and competition. Default false returns only core keywords (DataForSEO ignore_synonyms=true). True includes variants (ignore_synonyms=false). This filters keywords, not metric estimates. Do not sum shared volumes. No effect for countries served from Google Ads data.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

type ResearchRow = {
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  competition: number | null;
  intent: string;
};

// The 12-month trend array is ~80% of the bytes per row and no MCP consumer
// reads it; get_keyword_metrics returns trends for the few keywords that need
// them.
function toResearchRow(row: EnrichedKeyword): ResearchRow {
  return {
    keyword: row.keyword,
    searchVolume: row.searchVolume,
    keywordDifficulty: row.keywordDifficulty,
    cpc: row.cpc,
    competition: row.competition,
    intent: row.intent,
  };
}

// The rows also ship in structuredContent; this table exists so MCP clients
// that surface only text content see every keyword and its metrics, not just
// the count summary.
const RESEARCH_COLUMNS: McpTableColumn<ResearchRow>[] = [
  { header: "keyword", value: (row) => row.keyword },
  { header: "volume", value: (row) => row.searchVolume },
  { header: "KD", value: (row) => row.keywordDifficulty },
  { header: "CPC", value: (row) => row.cpc },
  { header: "competition", value: (row) => row.competition },
  { header: "intent", value: (row) => row.intent },
];

export const researchKeywordsTool = {
  name: "research_keywords",
  config: {
    title: "Research keywords (bulk)",
    description:
      "Find keyword ideas for 1-5 seed keywords in one call, each with search volume, keyword difficulty, and CPC. Use it to learn what people search for around a topic. One bad seed won't fail the batch. Costs ~54 credits per seed at the default result limit and ~110 at 500; an obscure seed's fallback lookup adds ~40-95, and countries served from Google Ads data cost a flat ~96, without difficulty or intent. For metrics on keywords you already have, use get_keyword_metrics; for seeds to start from, use get_suggested_keywords.",
    inputSchema,
    outputSchema: z.looseObject({
      results: z.array(
        z.union([
          z
            .object({
              seed: z.string(),
              ok: z.literal(true),
              rowCount: z.number(),
              source: z.string(),
              usedFallback: z.boolean(),
              rows: z.array(looseObjectOutputSchema),
            })
            .passthrough(),
          z
            .object({
              seed: z.string(),
              ok: z.literal(false),
              error: z.string(),
            })
            .passthrough(),
        ]),
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
    const results = await Promise.all(
      args.seeds.map(async (item) => {
        try {
          const { locationCode, languageCode } = resolveMarket(
            item,
            context.project,
          );
          assertLanguageForLocation(locationCode, languageCode);
          const data = await KeywordResearchService.research(
            {
              projectId: args.projectId,
              keywords: [item.seed],
              locationCode,
              languageCode,
              locationName: item.locationName,
              resultLimit: args.resultLimit ?? 150,
              mode: "auto",
              clickstream: args.includeClickstreamData ?? false,
              groupKeywords: args.groupKeywords ?? false,
            },
            context.billing,
          );
          return {
            seed: item.seed,
            ok: true as const,
            locationName: item.locationName,
            rowCount: data.rows.length,
            source: data.source,
            usedFallback: data.usedFallback,
            rows: data.rows.map(toResearchRow),
          };
        } catch (error) {
          return {
            seed: item.seed,
            ok: false as const,
            error: toolErrorMessage(error),
          };
        }
      }),
    );

    const okCount = results.filter((r) => r.ok).length;
    if (okCount > 0) await recordResearchStep(args.projectId, "keywords");
    const failCount = results.length - okCount;
    // One text budget for the whole response, split across the seeds.
    const budget = sectionTableBudget(results.length);
    const text =
      results
        .map((r) => {
          if (!r.ok) {
            return `## "${r.seed}" — FAILED\n${r.error}`;
          }
          const scope = r.locationName
            ? `, volume/CPC/competition for ${r.locationName}, KD/intent national`
            : "";
          const header = `## "${r.seed}" — ${r.rowCount} keywords (source: ${r.source}${r.usedFallback ? ", fallback" : ""}${scope})`;
          if (r.rowCount === 0) {
            return `${header}\n(no keywords returned) Try a shorter, broader seed, or get_keyword_metrics for this seed's own volume.`;
          }
          return `${header}\n${formatMcpTable(r.rows, RESEARCH_COLUMNS, budget)}`;
        })
        .join("\n\n") +
      `\n\nResearched ${okCount} of ${results.length} seeds${failCount > 0 ? ` (${failCount} failed)` : ""}. Columns: volume = monthly searches, KD = keyword difficulty (0-100), CPC in USD, competition = paid competition (0-1); "—" = unavailable. Google Ads close variants may share search volumes; do not add their volumes together.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { results },
    });
  }),
};
