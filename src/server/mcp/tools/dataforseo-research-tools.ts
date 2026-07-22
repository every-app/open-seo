/* eslint-disable max-lines */
import { z } from "zod";
import {
  createDataforseoClient,
  fetchKeywordMetricsForList,
  type KeywordMetricRow,
} from "@/server/lib/dataforseo";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
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
import { resolveLabsMarket, resolveMarket } from "@/shared/keyword-locations";
import { assertLanguageForLocation } from "@/server/lib/market";
import {
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
      .optional()
      .describe(
        "Country selector. Only the United States can be selected explicitly.",
      ),
  })
  .optional()
  .describe(
    "Optional market object. Omitted = the project's default market (United States unless the project overrides it).",
  );

const nearSchema = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe("Latitude of the search center."),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of the search center."),
    radiusKm: z
      .number()
      .min(1)
      .max(100000)
      .describe("Search radius around the center, in kilometers."),
  })
  .describe("Coordinate and radius to search around.");

const localSerpNearSchema = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe("Latitude the SERP is fetched from."),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude the SERP is fetched from."),
    zoom: z
      .number()
      .int()
      .min(4)
      .max(18)
      .optional()
      .describe("Map zoom level (4-18). Higher zoom narrows the local area."),
  })
  .describe("Coordinate (and optional map zoom) the SERP is fetched from.");

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
  target: rankedTargetSchema.describe(
    "Domain (no protocol/www) or absolute page URL to list ranked keywords for.",
  ),
  market: marketSchema,
  resultTypes: z
    .array(rankedResultTypeSchema)
    .min(1)
    .max(5)
    .optional()
    .describe("SERP result types to include. Defaults to organic and paid."),
  includeSubdomains: z
    .boolean()
    .optional()
    .describe(
      "Include subdomains of the target. Defaults to true for domains, false for page URLs.",
    ),
  minSearchVolume: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Only return keywords with at least this monthly search volume."),
  maxRank: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Only return keywords ranking at this position or better."),
  excludeBrandTerms: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(10)
    .optional()
    .describe("Exclude keywords containing any of these brand terms."),
  sortBy: z
    .enum(["rank", "search_volume", "traffic_estimate", "cpc"])
    .optional()
    .describe("Sort order for returned rows. Defaults to search_volume."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum rows to return (1-100). Defaults to 50."),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe("Rows to skip for pagination."),
} as const;

const searchLocalBusinessesInputSchema = {
  projectId: projectIdSchema,
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Business name or title text to match."),
  near: nearSchema,
  categories: z
    .array(z.string().min(1).max(120))
    .min(1)
    .max(10)
    .optional()
    .describe("Business categories to filter by (e.g. 'pizza_restaurant')."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum businesses to return (1-50). Defaults to 20."),
} as const;

const localSearchTypeSchema = z.enum(["maps", "local_finder"]);

const getLocalSerpResultsInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(120)
    .describe("Search query to run on Google Maps or Local Finder."),
  near: localSerpNearSchema,
  searchType: localSearchTypeSchema
    .optional()
    .describe("Which local SERP to fetch. Defaults to maps."),
  device: z
    .enum(["desktop", "mobile"])
    .optional()
    .describe("Device the SERP is rendered for. Defaults to desktop."),
  depth: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of results to fetch (1-100). Defaults to 20."),
  languageCode: languageCodeSchema.optional(),
} as const;

const getGoogleBusinessQuestionsInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Business name or search phrase identifying the Google Business Profile.",
    ),
  near: nearSchema,
  depth: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum Q&A rows to fetch (1-100). Defaults to 20."),
  languageCode: languageCodeSchema.optional(),
} as const;

const findSerpCompetitorsInputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1).max(120))
    .min(1)
    .max(100)
    .describe("Keywords whose SERPs are compared (1-100)."),
  market: marketSchema,
  resultTypes: z
    .array(serpCompetitorResultTypeSchema)
    .min(1)
    .max(4)
    .optional()
    .describe(
      "SERP result types to include. Defaults to organic and local_pack.",
    ),
  excludeDomains: z
    .array(domainTargetSchema)
    .min(1)
    .max(50)
    .optional()
    .describe("Domains to exclude from results (e.g. the user's own site)."),
  includeSubdomains: z
    .boolean()
    .optional()
    .describe("Count subdomains as part of the same competitor domain."),
  sortBy: z
    .enum(["visibility", "traffic_estimate", "avg_position", "keyword_count"])
    .optional()
    .describe("Sort order for returned competitors. Defaults to visibility."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum competitors to return (1-100). Defaults to 50."),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe("Rows to skip for pagination."),
} as const;

const keywordMetricsSortSchema = z.enum([
  "search_volume",
  "keyword_difficulty",
  "cpc",
  "competition",
]);

const getKeywordMetricsInputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(700)
    .describe("Keywords to fetch metrics for (1-700)."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  includeMonthlyTrends: z
    .boolean()
    .optional()
    .describe("Include monthly search-volume trend rows. Defaults to true."),
  includeClickstreamData: z
    .boolean()
    .optional()
    .describe(
      "Refine search volumes with clickstream data, which disaggregates Google Ads' grouped close-variant volumes (plurals/misspellings). DOUBLES the credit cost of the call. Default false. No effect for countries served from Google Ads data.",
    ),
  sortBy: keywordMetricsSortSchema
    .optional()
    .describe("Sort order for returned rows. Defaults to search_volume."),
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

/**
 * Resolves the market selector to a Labs location + language. An explicit
 * country wins; omitted inherits the project's default via resolveLabsMarket,
 * which keeps these Labs-only tools off an Ads-served project market.
 */
function resolveMarketSelector(
  market: Market | undefined,
  project: { locationCode: number; languageCode: string },
): { locationCode: number; languageCode: string } {
  if (market?.country != null) {
    // The Zod enum already restricts explicit values to United States variants.
    return { locationCode: DEFAULT_LOCATION_CODE, languageCode: "en" };
  }
  return resolveLabsMarket({}, project);
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

// Project the shared canonical metric row onto this tool's snake_case API
// shape (kept stable for MCP clients); an absent trend stays null as before.
function toMcpKeywordMetricRow(row: KeywordMetricRow) {
  return {
    keyword: row.keyword,
    search_volume: row.searchVolume,
    keyword_difficulty: row.keywordDifficulty,
    main_intent: row.intent,
    cpc: row.cpc,
    competition: row.competition,
    competition_level: row.competitionLevel,
    monthly_searches: row.monthlySearches.length
      ? row.monthlySearches.map((entry) => ({
          year: entry.year,
          month: entry.month,
          search_volume: entry.searchVolume,
        }))
      : null,
  };
}

type McpKeywordMetricRow = ReturnType<typeof toMcpKeywordMetricRow>;

function sortKeywordMetricRows(
  rows: McpKeywordMetricRow[],
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

// Provider rows ship in full in structuredContent; these tables render every
// row into the text content block so text-only MCP clients see the data, not
// just a count. Loose rows are read positionally via readPath.

type RankedKeywordRow = {
  keyword: unknown;
  rank: unknown;
  volume: unknown;
  cpc: unknown;
  url: unknown;
};

function toRankedKeywordRow(item: unknown): RankedKeywordRow {
  return {
    keyword:
      readPath(item, "keyword_data", "keyword") ?? readPath(item, "keyword"),
    rank:
      readPath(item, "ranked_serp_element", "serp_item", "rank_absolute") ??
      readPath(item, "ranked_serp_element", "rank_absolute") ??
      readPath(item, "rank_absolute"),
    volume: readPath(item, "keyword_data", "keyword_info", "search_volume"),
    cpc: readPath(item, "keyword_data", "keyword_info", "cpc"),
    url:
      readPath(item, "ranked_serp_element", "serp_item", "url") ??
      readPath(item, "ranked_serp_element", "url"),
  };
}

const RANKED_KEYWORD_COLUMNS: McpTableColumn<RankedKeywordRow>[] = [
  { header: "keyword", value: (row) => row.keyword },
  { header: "rank", value: (row) => row.rank },
  { header: "volume", value: (row) => row.volume },
  { header: "CPC", value: (row) => row.cpc },
  { header: "url", value: (row) => row.url },
];

const LOCAL_BUSINESS_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "title", value: (row) => readPath(row, "title") },
  { header: "category", value: (row) => readPath(row, "category") },
  { header: "rating", value: (row) => readPath(row, "rating", "value") },
  { header: "reviews", value: (row) => readPath(row, "rating", "votes_count") },
  { header: "phone", value: (row) => readPath(row, "phone") },
  { header: "address", value: (row) => readPath(row, "address") },
];

const LOCAL_SERP_COLUMNS: McpTableColumn<unknown>[] = [
  {
    header: "rank",
    value: (row) =>
      readPath(row, "rank_absolute") ?? readPath(row, "rank_group"),
  },
  { header: "title", value: (row) => readPath(row, "title") },
  { header: "rating", value: (row) => readPath(row, "rating", "value") },
  { header: "reviews", value: (row) => readPath(row, "rating", "votes_count") },
  { header: "phone", value: (row) => readPath(row, "phone") },
  { header: "address", value: (row) => readPath(row, "address") },
];

const BUSINESS_QUESTION_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "question", value: (row) => readPath(row, "question_text") },
  { header: "asked by", value: (row) => readPath(row, "profile_name") },
  { header: "when", value: (row) => readPath(row, "time_ago") },
  {
    header: "answers",
    value: (row) => {
      const answers = readPath(row, "items");
      return Array.isArray(answers) ? answers.length : 0;
    },
  },
];

const SERP_COMPETITOR_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "domain", value: (row) => readPath(row, "domain") },
  { header: "keywords", value: (row) => readPath(row, "keywords_count") },
  { header: "avg pos", value: (row) => readPath(row, "avg_position") },
  { header: "median pos", value: (row) => readPath(row, "median_position") },
  { header: "visibility", value: (row) => readPath(row, "visibility") },
  { header: "etv", value: (row) => readPath(row, "etv") },
];

const KEYWORD_METRIC_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  { header: "volume", value: (row) => readPath(row, "search_volume") },
  { header: "KD", value: (row) => readPath(row, "keyword_difficulty") },
  { header: "CPC", value: (row) => readPath(row, "cpc") },
  { header: "competition", value: (row) => readPath(row, "competition") },
  { header: "intent", value: (row) => readPath(row, "main_intent") },
];

export const getRankedKeywordsTool = {
  name: "get_ranked_keywords",
  config: {
    title: "Get ranked keywords",
    description:
      "Returns exact keyword, URL, rank, search volume, CPC, intent, and traffic rows for a domain or page. Use this for strategy evidence; use get_domain_overview for aggregate domain footprint. Charges credits.",
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
    const market = resolveMarketSelector(args.market, context.project);
    const keywords = await client.domain.rankedKeywords({
      target: args.target,
      locationCode: market.locationCode,
      languageCode: market.languageCode,
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

    const rankedRows = keywords.items.map(toRankedKeywordRow);
    const text =
      rankedRows.length === 0
        ? `No ranked keyword rows for ${args.target}.`
        : `Found ${rankedRows.length} ranked keyword rows for ${args.target}${keywords.totalCount != null ? ` (of ${keywords.totalCount} total)` : ""}:\n${formatMcpTable(rankedRows, RANKED_KEYWORD_COLUMNS)}`;
    return mcpResponse({
      text,
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
      "Searches local business listings near a coordinate. Use this to find local business candidates or nearby competitors; it does not run Maps rank checks or Q&A. Charges credits.",
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

      const header = `Found ${businesses.length} local business rows${args.query ? ` for ${args.query}` : ""}.`;
      return mcpResponse({
        text:
          businesses.length === 0
            ? header
            : `${header}\n${formatMcpTable(businesses, LOCAL_BUSINESS_COLUMNS)}`,
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
      "Fetches one Google Maps or Local Finder SERP near a coordinate. Returns provider rows with rank fields intact; callers decide how to match a target business. Charges credits.",
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
        languageCode: args.languageCode ?? context.project.languageCode,
        searchType: args.searchType ?? "maps",
        device: args.device ?? "desktop",
        depth: args.depth ?? 20,
        searchPlaces: false,
      });

      const header = `Fetched ${results.length} local SERP rows for "${args.keyword}".`;
      return mcpResponse({
        text:
          results.length === 0
            ? header
            : `${header}\n${formatMcpTable(results, LOCAL_SERP_COLUMNS)}`,
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
      "Fetches Google Business Profile questions and answers for one business keyword near a coordinate. Run this only when Q&A evidence is needed. Charges credits.",
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
        languageCode: args.languageCode ?? context.project.languageCode,
        depth: args.depth ?? 20,
      });

      const header = `Fetched ${questions.length} Google Business Q&A rows for ${args.keyword}.`;
      return mcpResponse({
        text:
          questions.length === 0
            ? header
            : `${header}\n${formatMcpTable(questions, BUSINESS_QUESTION_COLUMNS)}`,
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
      "Compares domains competing in Google results for a supplied keyword set. Useful for market and search-intelligence reports; not radius-based local SEO. Charges credits.",
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
      const market = resolveMarketSelector(args.market, context.project);
      const competitors = await client.labs.serpCompetitors({
        keywords: args.keywords,
        locationCode: market.locationCode,
        languageCode: market.languageCode,
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

      const header = `Found ${sorted.length} SERP competitors across ${args.keywords.length} keywords.`;
      return mcpResponse({
        text:
          sorted.length === 0
            ? header
            : `${header}\n${formatMcpTable(sorted, SERP_COMPETITOR_COLUMNS)}`,
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
      "Hydrate up to 700 known keywords with search volume, keyword difficulty (KD), search intent, CPC, competition, and monthly trends in a single call. Use it to score candidate or known keywords — including Search Console striking-distance queries — by real demand and ranking difficulty. For countries served from Google Ads data (e.g. Iceland), KD and intent are null. Charges credits.",
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
    const { locationCode, languageCode } = resolveMarket(args, context.project);
    // Assert against the RESOLVED pair: an explicit language with an omitted
    // location must validate against the project's default location.
    assertLanguageForLocation(locationCode, languageCode);
    const client = createDataforseoClient(context.billing);
    const metrics = await fetchKeywordMetricsForList(client, {
      keywords: args.keywords,
      locationCode,
      languageCode,
      includeClickstreamData: args.includeClickstreamData ?? false,
      creditFeature: "keyword_research",
    });
    const rows = sortKeywordMetricRows(
      metrics.map(toMcpKeywordMetricRow),
      args.sortBy ?? "search_volume",
    ).map((row) =>
      args.includeMonthlyTrends === false
        ? Object.fromEntries(
            Object.entries(row).filter(([key]) => key !== "monthly_searches"),
          )
        : row,
    );

    const header = `Fetched metrics for ${rows.length} keywords. Columns: volume = monthly searches, KD = keyword difficulty (0-100), CPC in USD, competition = paid competition (0-1); "—" = unavailable.`;
    return mcpResponse({
      text:
        rows.length === 0
          ? header
          : `${header}\n${formatMcpTable(rows, KEYWORD_METRIC_COLUMNS)}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { keywords: rows },
    });
  }),
};
