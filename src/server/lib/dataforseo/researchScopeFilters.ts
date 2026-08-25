import {
  escapeLikeTerm,
  joinClauses,
  type FilterClause,
} from "@/server/lib/dataforseo/filters";
import type { ResearchScope, ResearchTarget } from "@/shared/researchScope";

/**
 * Provider-side scope filters for the DataForSEO Labs endpoints. A Labs domain
 * target rolls up the hostname AND all of its subdomains (verified against the
 * live API), so every scope narrower than `subdomains` needs filter conditions:
 *
 * - ranked_keywords rows expose `serp_item.domain` (exact result hostname,
 *   which reports `www.` for www-canonical sites) and `serp_item.relative_url`
 *   (path + query string).
 * - relevant_pages rows only expose `page_address` (absolute URL), so both the
 *   host pin and the path prefix ride on `like` patterns. `regex` is unusable:
 *   the API rejects any pattern containing `/`.
 *
 * Query-string URL variants (`/path?x=y`) are covered for ranked_keywords but
 * not for relevant_pages, where query-string page addresses are rare and each
 * extra pattern costs one of the 8 filter conditions.
 */

export type ScopeFilter = {
  /** Clauses to AND in front of user filters. Empty for subdomains scope. */
  clauses: FilterClause[];
  /** How many of the 8-condition budget the clauses consume. */
  conditionCount: number;
};

const NO_FILTER: ScopeFilter = { clauses: [], conditionCount: 0 };

/**
 * Leaf conditions in a clause list or joined expression, counting through
 * nested OR/AND groups and skipping "and"/"or" separators.
 * RESEARCH_SCOPE_FILTER_SLOTS mirrors these counts for the client; a test
 * pins the two together.
 */
export function countExpressionConditions(clauses: readonly unknown[]): number {
  let count = 0;
  for (const clause of clauses) {
    if (!Array.isArray(clause)) continue;
    count += Array.isArray(clause[0]) ? countExpressionConditions(clause) : 1;
  }
  return count;
}

function scopeFilter(clauses: FilterClause[]): ScopeFilter {
  return { clauses, conditionCount: countExpressionConditions(clauses) };
}

function subfolderUrlClauses(
  field: string,
  hostname: string,
  path: string,
): FilterClause {
  const hosts = [hostname, `www.${hostname}`].map(escapeLikeTerm);
  const escapedPath = escapeLikeTerm(path);
  return joinClauses(
    hosts.flatMap((host) => [
      [field, "like", `%://${host}${escapedPath}`],
      [field, "like", `%://${host}${escapedPath}/%`],
    ]),
    "or",
  );
}

/**
 * Scope filter on an absolute-URL field of the Backlinks API (`url_to` for
 * backlink rows, `url` for domain pages). Only subfolder scope needs filters —
 * the API has no prefix targeting — every other scope rides on the target.
 */
export function buildBacklinksScopeFilter(
  field: "url_to" | "url",
  target: { scope: ResearchScope; apiTarget: string; path: string },
): ScopeFilter {
  if (target.scope !== "subfolder") return NO_FILTER;
  // For subfolder scope apiTarget is the bare hostname.
  return scopeFilter([
    subfolderUrlClauses(field, target.apiTarget, target.path),
  ]);
}

/** ANDs scope clauses in front of an already-joined flat filter expression. */
export function prependScopeClauses(
  scope: ScopeFilter,
  expression: unknown[],
): unknown[] {
  if (scope.clauses.length === 0) return expression;
  const joined = joinClauses(scope.clauses, "and");
  return expression.length === 0 ? joined : [...joined, "and", ...expression];
}

function hostPin(target: ResearchTarget): FilterClause {
  return [
    "ranked_serp_element.serp_item.domain",
    "in",
    [target.hostname, `www.${target.hostname}`],
  ];
}

export function buildRankedKeywordsScopeFilter(
  target: ResearchTarget,
): ScopeFilter {
  const relativeUrl = "ranked_serp_element.serp_item.relative_url";
  const path = target.path || "/";
  const escapedPath = escapeLikeTerm(path);

  switch (target.scope) {
    case "subdomains":
      return NO_FILTER;
    case "domain":
      return scopeFilter([hostPin(target)]);
    case "subfolder":
      return scopeFilter([
        hostPin(target),
        joinClauses(
          [
            [relativeUrl, "=", path],
            [relativeUrl, "like", `${escapedPath}/%`],
            [relativeUrl, "like", `${escapedPath}?%`],
          ],
          "or",
        ),
      ]);
    case "exact_url":
      return scopeFilter([
        hostPin(target),
        joinClauses(
          [
            [relativeUrl, "in", [path, `${path}/`]],
            [relativeUrl, "like", `${escapedPath}?%`],
            [relativeUrl, "like", `${escapedPath}/?%`],
          ],
          "or",
        ),
      ]);
  }
}

export function buildRelevantPagesScopeFilter(
  target: ResearchTarget,
): ScopeFilter {
  const hosts = [target.hostname, `www.${target.hostname}`].map(escapeLikeTerm);
  const path = escapeLikeTerm(target.path || "/");

  switch (target.scope) {
    case "subdomains":
      return NO_FILTER;
    case "domain":
      return scopeFilter([
        joinClauses(
          hosts.map((host) => ["page_address", "like", `%://${host}/%`]),
          "or",
        ),
      ]);
    case "subfolder":
      return scopeFilter([
        subfolderUrlClauses("page_address", target.hostname, target.path),
      ]);
    case "exact_url":
      return scopeFilter([
        joinClauses(
          hosts.flatMap((host) => [
            ["page_address", "like", `%://${host}${path}`],
            ["page_address", "like", `%://${host}${path}/`],
          ]),
          "or",
        ),
      ]);
  }
}
