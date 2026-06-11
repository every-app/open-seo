import {
  assertFilterConditionBudget,
  collectNumericRange,
  escapeLikeTerm,
  joinClauses,
  parseFilterTerms,
  type FilterClause,
} from "@/server/lib/dataforseo/filters";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";

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

/**
 * Each include/exclude term is one ilike clause; numeric ranges add one per
 * bound; the free-text search term adds one OR-group of two (keyword OR url).
 * The client surfaces the same condition count and disables Apply when over
 * the DataForSEO budget.
 */
export function buildKeywordFilters(
  filters: DomainKeywordsFilters,
  searchTerm?: string,
): unknown[] {
  const conditions: FilterClause[] = [];

  for (const term of parseFilterTerms(filters.include)) {
    conditions.push([
      "keyword_data.keyword",
      "ilike",
      `%${escapeLikeTerm(term)}%`,
    ]);
  }
  for (const term of parseFilterTerms(filters.exclude)) {
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
  assertFilterConditionBudget(conditions.length + (searchGroup ? 2 : 0));

  return joinClauses(
    searchGroup ? [...conditions, searchGroup] : conditions,
    "and",
  );
}

function buildSearchGroup(term: string): FilterClause {
  const escaped = escapeLikeTerm(term);
  return [
    ["keyword_data.keyword", "ilike", `%${escaped}%`],
    "or",
    ["ranked_serp_element.serp_item.url", "ilike", `%${escaped}%`],
  ];
}
