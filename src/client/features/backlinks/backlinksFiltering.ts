import { parseTerms } from "@/client/features/keywords/utils";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import type {
  BacklinksTabFilterValues,
  ReferringDomainsFilterValues,
  TopPagesFilterValues,
} from "./backlinksFilterTypes";

function passesNumericFilter(
  value: number | null | undefined,
  min: string,
  max: string,
): boolean {
  if (value == null) return true;
  const minN = Number(min);
  if (min && !Number.isNaN(minN) && value < minN) return false;
  const maxN = Number(max);
  if (max && !Number.isNaN(maxN) && value > maxN) return false;
  return true;
}

function passesTextFilter(
  haystack: string,
  includeTerms: string[],
  excludeTerms: string[],
): boolean {
  const lower = haystack.toLowerCase();
  if (
    includeTerms.length > 0 &&
    !includeTerms.some((term) => lower.includes(term))
  ) {
    return false;
  }
  if (excludeTerms.some((term) => lower.includes(term))) {
    return false;
  }
  return true;
}

export function filterBacklinkRows(
  rows: BacklinksOverviewData["backlinks"],
  filters: BacklinksTabFilterValues,
): BacklinksOverviewData["backlinks"] {
  const includeTerms = parseTerms(filters.include);
  const excludeTerms = parseTerms(filters.exclude);

  return rows.filter((row) => {
    const textFields = [row.domainFrom, row.urlFrom, row.urlTo, row.anchor]
      .filter((v): v is string => Boolean(v))
      .join(" ");

    if (!passesTextFilter(textFields, includeTerms, excludeTerms)) return false;
    if (
      !passesNumericFilter(
        row.domainFromRank,
        filters.minDomainRank,
        filters.maxDomainRank,
      )
    )
      return false;
    if (
      !passesNumericFilter(
        row.rank,
        filters.minLinkAuthority,
        filters.maxLinkAuthority,
      )
    )
      return false;
    if (
      !passesNumericFilter(
        row.spamScore,
        filters.minSpamScore,
        filters.maxSpamScore,
      )
    )
      return false;

    if (filters.linkType === "dofollow" && row.isDofollow !== true)
      return false;
    if (filters.linkType === "nofollow" && row.isDofollow !== false)
      return false;

    if (filters.hideLost === "true" && row.isLost) return false;
    if (filters.hideBroken === "true" && row.isBroken) return false;

    return true;
  });
}

export function filterReferringDomainRows(
  rows: BacklinksOverviewData["referringDomains"],
  filters: ReferringDomainsFilterValues,
): BacklinksOverviewData["referringDomains"] {
  const includeTerms = parseTerms(filters.include);
  const excludeTerms = parseTerms(filters.exclude);

  return rows.filter((row) => {
    if (!passesTextFilter(row.domain ?? "", includeTerms, excludeTerms))
      return false;
    if (
      !passesNumericFilter(
        row.backlinks,
        filters.minBacklinks,
        filters.maxBacklinks,
      )
    )
      return false;
    if (!passesNumericFilter(row.rank, filters.minRank, filters.maxRank))
      return false;
    return true;
  });
}

export function filterTopPageRows(
  rows: BacklinksOverviewData["topPages"],
  filters: TopPagesFilterValues,
): BacklinksOverviewData["topPages"] {
  const includeTerms = parseTerms(filters.include);
  const excludeTerms = parseTerms(filters.exclude);

  return rows.filter((row) => {
    if (!passesTextFilter(row.page ?? "", includeTerms, excludeTerms))
      return false;
    if (
      !passesNumericFilter(
        row.backlinks,
        filters.minBacklinks,
        filters.maxBacklinks,
      )
    )
      return false;
    if (
      !passesNumericFilter(
        row.referringDomains,
        filters.minReferringDomains,
        filters.maxReferringDomains,
      )
    )
      return false;
    if (!passesNumericFilter(row.rank, filters.minRank, filters.maxRank))
      return false;
    return true;
  });
}

export function countActiveFilters(values: Record<string, string>): number {
  return Object.values(values).filter((v) => v.trim() !== "").length;
}
