import {
  assertFilterConditionBudget,
  buildIncludeOrGroup,
  collectNumericRange,
  escapeLikeTerm,
  joinClauses,
  parseFilterTerms,
  type FilterClause,
} from "@/server/lib/dataforseo/filters";
import type {
  BacklinksRowsFilters,
  BacklinksRowsSortField,
  BacklinksSortOrder,
  ReferringDomainsFilters,
  ReferringDomainsSortField,
  TopPagesFilters,
  TopPagesSortField,
} from "@/types/schemas/backlinks";

const BACKLINKS_ROWS_SORT_FIELDS: Record<BacklinksRowsSortField, string> = {
  rank: "rank",
  domainRank: "domain_from_rank",
  spamScore: "backlink_spam_score",
  firstSeen: "first_seen",
};

const REFERRING_DOMAINS_SORT_FIELDS: Record<ReferringDomainsSortField, string> =
  {
    domain: "domain",
    backlinks: "backlinks",
    referringPages: "referring_pages",
    rank: "rank",
    spamScore: "backlinks_spam_score",
    firstSeen: "first_seen",
    brokenBacklinks: "broken_backlinks",
  };

const TOP_PAGES_SORT_FIELDS: Record<TopPagesSortField, string> = {
  backlinks: "backlinks",
  referringDomains: "referring_domains",
  rank: "rank",
  brokenBacklinks: "broken_backlinks",
};

export function buildBacklinksRowsOrderBy(
  field: BacklinksRowsSortField,
  order: BacklinksSortOrder,
): string[] {
  return [`${BACKLINKS_ROWS_SORT_FIELDS[field]},${order}`];
}

export function buildReferringDomainsOrderBy(
  field: ReferringDomainsSortField,
  order: BacklinksSortOrder,
): string[] {
  return [`${REFERRING_DOMAINS_SORT_FIELDS[field]},${order}`];
}

export function buildTopPagesOrderBy(
  field: TopPagesSortField,
  order: BacklinksSortOrder,
): string[] {
  return [`${TOP_PAGES_SORT_FIELDS[field]},${order}`];
}

/**
 * Translates the Backlinks tab filters into DataForSEO filter expressions.
 * Include/exclude terms match the source URL (which contains the linking
 * domain): include terms are OR'd (match any), exclude terms AND'd (drop all).
 */
export function buildBacklinksRowsApiFilters(
  filters: BacklinksRowsFilters,
): unknown[] {
  const conditions: FilterClause[] = [];

  collectExcludeConditions(conditions, "url_from", filters.exclude);
  collectNumericRange(
    conditions,
    "domain_from_rank",
    filters.minDomainRank,
    filters.maxDomainRank,
  );
  collectNumericRange(
    conditions,
    "rank",
    filters.minLinkAuthority,
    filters.maxLinkAuthority,
  );
  collectNumericRange(
    conditions,
    "backlink_spam_score",
    filters.minSpamScore,
    filters.maxSpamScore,
  );
  if (filters.linkType) {
    conditions.push(["dofollow", "=", filters.linkType === "dofollow"]);
  }
  if (filters.hideLost) {
    conditions.push(["is_lost", "=", false]);
  }
  if (filters.hideBroken) {
    conditions.push(["is_broken", "=", false]);
  }
  if (filters.domainFrom) {
    conditions.push(["domain_from", "=", filters.domainFrom]);
  }

  return finishFilters("url_from", filters.include, conditions);
}

export function buildReferringDomainsApiFilters(
  filters: ReferringDomainsFilters,
): unknown[] {
  const conditions: FilterClause[] = [];

  collectExcludeConditions(conditions, "domain", filters.exclude);
  collectNumericRange(
    conditions,
    "backlinks",
    filters.minBacklinks,
    filters.maxBacklinks,
  );
  collectNumericRange(conditions, "rank", filters.minRank, filters.maxRank);
  collectNumericRange(
    conditions,
    "backlinks_spam_score",
    filters.minSpamScore,
    filters.maxSpamScore,
  );

  return finishFilters("domain", filters.include, conditions);
}

export function buildTopPagesApiFilters(filters: TopPagesFilters): unknown[] {
  const conditions: FilterClause[] = [];

  collectExcludeConditions(conditions, "url", filters.exclude);
  collectNumericRange(
    conditions,
    "backlinks",
    filters.minBacklinks,
    filters.maxBacklinks,
  );
  collectNumericRange(
    conditions,
    "referring_domains",
    filters.minReferringDomains,
    filters.maxReferringDomains,
  );
  collectNumericRange(conditions, "rank", filters.minRank, filters.maxRank);

  return finishFilters("url", filters.include, conditions);
}

function collectExcludeConditions(
  out: FilterClause[],
  field: string,
  exclude: string | undefined,
) {
  for (const term of parseFilterTerms(exclude)) {
    out.push([field, "not_ilike", `%${escapeLikeTerm(term)}%`]);
  }
}

/** Prepends the OR'd include group, enforces the condition budget, joins with "and". */
function finishFilters(
  includeField: string,
  include: string | undefined,
  conditions: FilterClause[],
): unknown[] {
  const includeGroup = buildIncludeOrGroup(includeField, include);
  assertFilterConditionBudget(
    conditions.length + (includeGroup?.conditionCount ?? 0),
  );
  return joinClauses(
    includeGroup ? [includeGroup.clause, ...conditions] : conditions,
    "and",
  );
}
