/* eslint-disable max-lines */
import { z } from "zod";
import {
  createDataforseoClient,
  type KeywordOverviewItem,
} from "@/server/lib/dataforseo";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LOCATION_CODE,
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

const rankedResultTypeSchema = z.enum([
  "organic",
  "paid",
  "featured_snippet",
  "local_pack",
  "ai_overview_reference",
]);

const serpCompetitorResultTypeSchema = z.enum([
  "organic",
  "paid",
  "featured_snippet",
  "local_pack",
]);

const marketSchema = z
  .object({
    country: z
      .enum(["US", "USA", "United States", "United States of America"])
      .optional(),
  })
  .optional()
  .describe("Optional United States market object. Defaults to United States.");

const nearSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(100000),
});

const localSerpNearSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  zoom: z.number().int().min(4).max(18).optional(),
});

const domainTargetSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      /^(?!https?:\/\/)(?!www\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
        value,
      ),
    "Use a domain or subdomain without protocol and without www.",
  );

const rankedTargetSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) =>
      /^https?:\/\/\S+$/.test(value) ||
      domainTargetSchema.safeParse(value).success,
    "Use a domain without protocol/www or an absolute page URL.",
  );

const getRankedKeywordsInputSchema = {
  projectId: projectIdSchema,
  target: rankedTargetSchema,
  market: marketSchema,
  resultTypes: z.array(rankedResultTypeSchema).min(1).max(5).optional(),
  includeSubdomains: z.boolean().optional(),
  minSearchVolume: z.number().int().min(0).optional(),
  maxRank: z.number().int().min(1).max(100).optional(),
  excludeBrandTerms: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(10)
    .optional(),
  sortBy: z
    .enum(["rank", "search_volume", "traffic_estimate", "cpc"])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(1000).optional(),
} as const;

const searchLocalBusinessesInputSchema = {
  projectId: projectIdSchema,
  query: z.string().min(1).max(200).optional(),
  near: nearSchema,
  categories: z.array(z.string().min(1).max(120)).min(1).max(10).optional(),
  limit: z.number().int().min(1).max(50).optional(),
} as const;

const localSearchTypeSchema = z.enum(["maps", "local_finder"]);

const getLocalSerpResultsInputSchema = {
  projectId: projectIdSchema,
  keyword: z.string().min(1).max(120),
  near: localSerpNearSchema,
  searchType: localSearchTypeSchema.optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
  depth: z.number().int().min(1).max(100).optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

const getGoogleBusinessQuestionsInputSchema = {
  projectId: projectIdSchema,
  keyword: z.string().min(1).max(200),
  near: nearSchema,
  depth: z.number().int().min(1).max(100).optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

const findSerpCompetitorsInputSchema = {
  projectId: projectIdSchema,
  keywords: z.array(z.string().min(1).max(120)).min(1).max(100),
  market: marketSchema,
  resultTypes: z.array(serpCompetitorResultTypeSchema).min(1).max(4).optional(),
  excludeDomains: z.array(domainTargetSchema).min(1).max(50).optional(),
  includeSubdomains: z.boolean().optional(),
  sortBy: z
    .enum(["visibility", "traffic_estimate", "avg_position", "keyword_count"])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(1000).optional(),
} as const;

const keywordMetricsSortSchema = z.enum([
  "search_volume",
  "keyword_difficulty",
  "cpc",
  "competition",
]);

const getKeywordMetricsInputSchema = {
  projectId: projectIdSchema,
  keywords: z.array(z.string().min(1).max(80)).min(1).max(700),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  includeMonthlyTrends: z.boolean().optional(),
  sortBy: keywordMetricsSortSchema.optional(),
} as const;

type Market = z.infer<typeof marketSchema>;
type GetRankedKeywordsArgs = z.infer<
  z.ZodObject<typeof getRankedKeywordsInputSchema>
>;
type FindSerpCompetitorsArgs = z.infer<
  z.ZodObject<typeof findSerpCompetitorsInputSchema>
>;
type GetKeywordMetricsArgs = z.infer<
  z.ZodObject<typeof getKeywordMetricsInputSchema>
>;
type SearchLocalBusinessesArgs = z.infer<
  z.ZodObject<typeof searchLocalBusinessesInputSchema>
>;
type GetLocalSerpResultsArgs = z.infer<
  z.ZodObject<typeof getLocalSerpResultsInputSchema>
>;
type GetGoogleBusinessQuestionsArgs = z.infer<
  z.ZodObject<typeof getGoogleBusinessQuestionsInputSchema>
>;

const QUESTIONS_ANSWERS_MIN_RADIUS = 200;
const QUESTIONS_ANSWERS_MAX_RADIUS = 199999;

function resolveMarketLocationCode(_market: Market | undefined): number {
  // The Zod enum on market.country already restricts values to United States
  // variants, so no other country can reach this code path.
  return DEFAULT_LOCATION_CODE;
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(7)).toString();
}

function formatBusinessLocationCoordinate(near: z.infer<typeof nearSchema>) {
  return `${formatCoordinate(near.latitude)},${formatCoordinate(near.longitude)},${near.radiusKm}`;
}

function formatQuestionsAnswersCoordinate(near: z.infer<typeof nearSchema>) {
  const radius = Math.min(
    QUESTIONS_ANSWERS_MAX_RADIUS,
    Math.max(QUESTIONS_ANSWERS_MIN_RADIUS, Math.round(near.radiusKm * 1000)),
  );
  return `${formatCoordinate(near.latitude)},${formatCoordinate(near.longitude)},${radius}`;
}

function formatLocalSerpCoordinate(near: z.infer<typeof localSerpNearSchema>) {
  const coordinate = `${formatCoordinate(near.latitude)},${formatCoordinate(near.longitude)}`;
  return near.zoom == null ? coordinate : `${coordinate},${near.zoom}z`;
}

function sortOrderByRankedMode(
  sortBy: GetRankedKeywordsArgs["sortBy"] = "search_volume",
): string[] {
  switch (sortBy) {
    case "rank":
      return ["ranked_serp_element.serp_item.rank_absolute,asc"];
    case "traffic_estimate":
      return ["ranked_serp_element.serp_item.etv,desc"];
    case "cpc":
      return ["keyword_data.keyword_info.cpc,desc"];
    case "search_volume":
      return ["keyword_data.keyword_info.search_volume,desc"];
  }
}

function pushAnd(filters: unknown[], condition: unknown[]) {
  if (filters.length > 0) filters.push("and");
  filters.push(condition);
}

function buildRankedKeywordFilters(args: {
  minSearchVolume?: number;
  maxRank?: number;
  excludeBrandTerms?: string[];
}) {
  const filters: unknown[] = [];
  if (args.minSearchVolume != null) {
    pushAnd(filters, [
      "keyword_data.keyword_info.search_volume",
      ">=",
      args.minSearchVolume,
    ]);
  }
  if (args.maxRank != null) {
    pushAnd(filters, [
      "ranked_serp_element.serp_item.rank_absolute",
      "<=",
      args.maxRank,
    ]);
  }
  if (args.excludeBrandTerms != null) {
    for (const term of args.excludeBrandTerms) {
      pushAnd(filters, ["keyword_data.keyword", "not_ilike", `%${term}%`]);
    }
  }
  return filters.length > 0 ? filters : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function displayValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "?";
}

function summarizeRankedKeyword(item: Record<string, unknown>): string {
  const keywordData = asRecord(item.keyword_data);
  const keywordInfo = asRecord(keywordData?.keyword_info);
  const serpElement = asRecord(item.ranked_serp_element);
  const serpItem = asRecord(serpElement?.serp_item);
  const keyword = displayValue(keywordData?.keyword ?? item.keyword);
  const rank = displayValue(
    serpItem?.rank_absolute ?? serpElement?.rank_absolute ?? item.rank_absolute,
  );
  const volume = displayValue(keywordInfo?.search_volume);
  const url = displayValue(serpItem?.url ?? serpElement?.url);
  return `- "${keyword}" #${rank} vol:${volume} ${url}`.trim();
}

function sortCompetitors(
  items: Record<string, unknown>[],
  sortBy: FindSerpCompetitorsArgs["sortBy"],
) {
  const field =
    sortBy === "avg_position"
      ? "avg_position"
      : sortBy === "keyword_count"
        ? "keywords_count"
        : sortBy === "traffic_estimate"
          ? "etv"
          : "visibility";
  const direction = sortBy === "avg_position" ? 1 : -1;
  return items.toSorted((a, b) => {
    const aValue = typeof a[field] === "number" ? a[field] : 0;
    const bValue = typeof b[field] === "number" ? b[field] : 0;
    return (aValue - bValue) * direction;
  });
}

function normalizeKeywordOverview(item: KeywordOverviewItem) {
  const info = item.keyword_info;
  return {
    keyword: item.keyword,
    search_volume: info?.search_volume ?? null,
    keyword_difficulty: item.keyword_properties?.keyword_difficulty ?? null,
    main_intent: item.search_intent_info?.main_intent ?? null,
    cpc: info?.cpc ?? null,
    competition: info?.competition ?? null,
    competition_level: info?.competition_level ?? null,
    monthly_searches: info?.monthly_searches ?? null,
  };
}

type KeywordMetricRow = ReturnType<typeof normalizeKeywordOverview>;

function sortKeywordMetricRows(
  rows: KeywordMetricRow[],
  sortBy: NonNullable<GetKeywordMetricsArgs["sortBy"]> = "search_volume",
) {
  return rows.toSorted((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    const aNum = typeof aValue === "number" ? aValue : 0;
    const bNum = typeof bValue === "number" ? bValue : 0;
    return bNum - aNum;
  });
}

function hostMatchesDomain(host: string, domain: string): boolean {
  const normalizedHost = host.replace(/^www\./, "").toLowerCase();
  const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();
  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

export const getRankedKeywordsTool = {
  name: "get_ranked_keywords",
  config: {
    title: "Get ranked keywords",
    description:
      "Returns exact keyword, URL, rank, search volume, CPC, intent, and traffic rows for a domain or page. Use this for strategy evidence; use get_domain_overview for aggregate domain footprint. Charges DataForSEO Labs credits.",
    inputSchema: getRankedKeywordsInputSchema,
    outputSchema: {
      keywords: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetRankedKeywordsArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const targetIsPage = /^https?:\/\//.test(args.target);
    const keywords = await client.domain.rankedKeywords({
      target: args.target,
      locationCode: resolveMarketLocationCode(args.market),
      languageCode: DEFAULT_LANGUAGE_CODE,
      limit: args.limit ?? 50,
      offset: args.offset,
      orderBy: sortOrderByRankedMode(args.sortBy),
      filters: buildRankedKeywordFilters({
        minSearchVolume: args.minSearchVolume,
        maxRank: args.maxRank,
        excludeBrandTerms: args.excludeBrandTerms,
      }),
      itemTypes: args.resultTypes,
      includeSubdomains: args.includeSubdomains ?? !targetIsPage,
    });

    return mcpResponse({
      text: [
        `Found ${keywords.items.length} ranked keyword rows for ${args.target}.`,
        ...keywords.items
          .slice(0, 10)
          .map((item) =>
            summarizeRankedKeyword(item as Record<string, unknown>),
          ),
      ].join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/domain`,
      ),
      structuredContent: {
        keywords: keywords.items,
        totalCount: keywords.totalCount,
      },
    });
  }),
};

export const searchLocalBusinessesTool = {
  name: "search_local_businesses",
  config: {
    title: "Search local businesses",
    description:
      "Searches DataForSEO Business Listings near a coordinate. Use this to find local business candidates or nearby competitors; it does not run Maps rank checks or Q&A. Charges DataForSEO Business Data credits.",
    inputSchema: searchLocalBusinessesInputSchema,
    outputSchema: {
      businesses: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: SearchLocalBusinessesArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const businesses = await client.business.businessListings({
        categories: args.categories,
        title: args.query,
        locationCoordinate: formatBusinessLocationCoordinate(args.near),
        limit: args.limit ?? 20,
      });

      return mcpResponse({
        text: `Found ${businesses.length} local business rows${args.query ? ` for ${args.query}` : ""}.`,
        meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}`),
        structuredContent: { businesses },
      });
    },
  ),
};

export const getLocalSerpResultsTool = {
  name: "get_local_serp_results",
  config: {
    title: "Get local SERP results",
    description:
      "Fetches one Google Maps or Local Finder SERP near a coordinate. Returns provider rows with rank fields intact; callers decide how to match a target business. Charges DataForSEO SERP credits.",
    inputSchema: getLocalSerpResultsInputSchema,
    outputSchema: {
      results: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetLocalSerpResultsArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const results = await client.serp.local({
        keyword: args.keyword,
        locationCoordinate: formatLocalSerpCoordinate(args.near),
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        searchType: args.searchType ?? "maps",
        device: args.device ?? "desktop",
        depth: args.depth ?? 20,
        searchPlaces: false,
      });

      return mcpResponse({
        text: `Fetched ${results.length} local SERP rows for "${args.keyword}".`,
        meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}`),
        structuredContent: { results },
      });
    },
  ),
};

export const getGoogleBusinessQuestionsTool = {
  name: "get_google_business_questions",
  config: {
    title: "Get Google business questions",
    description:
      "Fetches Google Business Profile questions and answers for one business keyword near a coordinate. Run this only when Q&A evidence is needed. Charges DataForSEO Business Data credits.",
    inputSchema: getGoogleBusinessQuestionsInputSchema,
    outputSchema: {
      questions: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetGoogleBusinessQuestionsArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const questions = await client.business.questionsAnswers({
        keyword: args.keyword,
        locationCoordinate: formatQuestionsAnswersCoordinate(args.near),
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        depth: args.depth ?? 20,
      });

      return mcpResponse({
        text: `Fetched ${questions.length} Google Business Q&A rows for ${args.keyword}.`,
        meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}`),
        structuredContent: { questions },
      });
    },
  ),
};

export const findSerpCompetitorsTool = {
  name: "find_serp_competitors",
  config: {
    title: "Find SERP competitors",
    description:
      "Compares domains competing for a supplied keyword set using DataForSEO Labs SERP Competitors. Useful for market and search-intelligence reports; not radius-based local SEO. Charges DataForSEO Labs credits.",
    inputSchema: findSerpCompetitorsInputSchema,
    outputSchema: {
      competitors: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: FindSerpCompetitorsArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const competitors = await client.labs.serpCompetitors({
        keywords: args.keywords,
        locationCode: resolveMarketLocationCode(args.market),
        languageCode: DEFAULT_LANGUAGE_CODE,
        itemTypes: args.resultTypes ?? ["organic", "local_pack"],
        includeSubdomains: args.includeSubdomains,
        limit: args.limit ?? 50,
        offset: args.offset,
      });
      const excludedDomains = args.excludeDomains ?? [];
      const filtered =
        excludedDomains.length === 0
          ? competitors
          : competitors.filter((item) => {
              const domain = typeof item.domain === "string" ? item.domain : "";
              return !excludedDomains.some((excludedDomain) =>
                hostMatchesDomain(domain, excludedDomain),
              );
            });
      const sorted = sortCompetitors(filtered, args.sortBy ?? "visibility");

      return mcpResponse({
        text: `Found ${sorted.length} SERP competitors across ${args.keywords.length} keywords.`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/domain`,
        ),
        structuredContent: { competitors: sorted },
      });
    },
  ),
};

export const getKeywordMetricsTool = {
  name: "get_keyword_metrics",
  config: {
    title: "Get keyword metrics",
    description:
      "Hydrate up to 700 known keywords with search volume, keyword difficulty (KD), search intent, CPC, competition, and monthly trends in a single call. Use it to score candidate or known keywords — including Search Console striking-distance queries — by real demand and ranking difficulty. Charges DataForSEO Labs credits.",
    inputSchema: getKeywordMetricsInputSchema,
    outputSchema: {
      keywords: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetKeywordMetricsArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const items = await client.labs.keywordOverview({
      keywords: args.keywords,
      locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
      languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      creditFeature: "keyword_research",
    });
    const rows = sortKeywordMetricRows(
      items.map(normalizeKeywordOverview),
      args.sortBy ?? "search_volume",
    ).map((row) =>
      args.includeMonthlyTrends === false
        ? Object.fromEntries(
            Object.entries(row).filter(([key]) => key !== "monthly_searches"),
          )
        : row,
    );

    return mcpResponse({
      text: `Fetched metrics (volume, difficulty, intent) for ${rows.length} keywords.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { keywords: rows },
    });
  }),
};
