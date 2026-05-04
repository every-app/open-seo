import {
  MAX_DATAFORSEO_FILTER_CONDITIONS,
  type DomainKeywordsFilters,
} from "@/types/schemas/domain";
import { AppError } from "@/server/lib/errors";

export type DomainKeywordsSortMode =
  | "rank"
  | "traffic"
  | "volume"
  | "score"
  | "cpc";
export type DomainKeywordsSortOrder = "asc" | "desc";

const SORT_FIELD_BY_MODE: Record<DomainKeywordsSortMode, string> = {
  rank: "ranked_serp_element.serp_item.rank_absolute",
  traffic: "ranked_serp_element.serp_item.etv",
  volume: "keyword_data.keyword_info.search_volume",
  score: "keyword_data.keyword_properties.keyword_difficulty",
  cpc: "keyword_data.keyword_info.cpc",
};

export function buildOrderBy(
  sortMode: DomainKeywordsSortMode,
  sortOrder: DomainKeywordsSortOrder,
): string[] {
  return [`${SORT_FIELD_BY_MODE[sortMode]},${sortOrder}`];
}

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function pushAnd(filters: unknown[], expression: Clause) {
  if (filters.length > 0) filters.push("and");
  filters.push(expression);
}

function parseTerms(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function collectNumericRange(
  out: Clause[],
  field: string,
  min: number | undefined,
  max: number | undefined,
) {
  if (typeof min === "number" && Number.isFinite(min)) {
    out.push([field, ">=", min]);
  }
  if (typeof max === "number" && Number.isFinite(max)) {
    out.push([field, "<=", max]);
  }
}

/**
 * DataForSEO accepts up to 8 filter conditions per request joined by
 * "and"/"or" operators. Each include/exclude term is one ilike clause;
 * numeric ranges add one per bound; the free-text search term adds one OR-
 * group of two (keyword OR url). The client surfaces the same condition
 * count and disables Apply when over budget, so reaching the cap here
 * indicates a misbehaving client — we throw rather than silently truncate.
 */
type Clause = unknown[];

export function buildKeywordFilters(
  filters: DomainKeywordsFilters,
  searchTerm?: string,
): unknown[] {
  const conditions: Clause[] = [];

  for (const term of parseTerms(filters.include)) {
    conditions.push([
      "keyword_data.keyword",
      "ilike",
      `%${escapeLikeTerm(term)}%`,
    ]);
  }
  for (const term of parseTerms(filters.exclude)) {
    conditions.push([
      "keyword_data.keyword",
      "not_ilike",
      `%${escapeLikeTerm(term)}%`,
    ]);
  }

  collectNumericRange(
    conditions,
    "keyword_data.keyword_info.search_volume",
    filters.minVol,
    filters.maxVol,
  );
  collectNumericRange(
    conditions,
    "ranked_serp_element.serp_item.etv",
    filters.minTraffic,
    filters.maxTraffic,
  );
  collectNumericRange(
    conditions,
    "keyword_data.keyword_info.cpc",
    filters.minCpc,
    filters.maxCpc,
  );
  collectNumericRange(
    conditions,
    "keyword_data.keyword_properties.keyword_difficulty",
    filters.minKd,
    filters.maxKd,
  );
  collectNumericRange(
    conditions,
    "ranked_serp_element.serp_item.rank_absolute",
    filters.minRank,
    filters.maxRank,
  );

  const trimmedSearch = searchTerm?.trim();
  const searchGroup = trimmedSearch ? buildSearchGroup(trimmedSearch) : null;

  // The search OR-group costs 2 slots; everything else is 1.
  const totalConditions = conditions.length + (searchGroup ? 2 : 0);
  if (totalConditions > MAX_DATAFORSEO_FILTER_CONDITIONS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Too many filter conditions (${totalConditions} of ${MAX_DATAFORSEO_FILTER_CONDITIONS} max).`,
    );
  }

  const expressions: unknown[] = [];
  for (const clause of conditions) pushAnd(expressions, clause);
  if (searchGroup) pushAnd(expressions, searchGroup);
  return expressions;
}

function buildSearchGroup(term: string): Clause {
  const escaped = escapeLikeTerm(term);
  return [
    ["keyword_data.keyword", "ilike", `%${escaped}%`],
    "or",
    ["ranked_serp_element.serp_item.url", "ilike", `%${escaped}%`],
  ];
}
