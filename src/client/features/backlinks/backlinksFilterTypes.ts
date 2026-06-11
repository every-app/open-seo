import type {
  BacklinksRowsFilters,
  ReferringDomainsFilters,
  TopPagesFilters,
} from "@/types/schemas/backlinks";

export type BacklinksTabFilterValues = {
  include: string;
  exclude: string;
  minDomainRank: string;
  maxDomainRank: string;
  minLinkAuthority: string;
  maxLinkAuthority: string;
  minSpamScore: string;
  maxSpamScore: string;
  linkType: string;
  hideLost: string;
  hideBroken: string;
};

export type ReferringDomainsFilterValues = {
  include: string;
  exclude: string;
  minBacklinks: string;
  maxBacklinks: string;
  minRank: string;
  maxRank: string;
  minSpamScore: string;
  maxSpamScore: string;
};

export type TopPagesFilterValues = {
  include: string;
  exclude: string;
  minBacklinks: string;
  maxBacklinks: string;
  minReferringDomains: string;
  maxReferringDomains: string;
  minRank: string;
  maxRank: string;
};

export const EMPTY_BACKLINKS_FILTERS: BacklinksTabFilterValues = {
  include: "",
  exclude: "",
  minDomainRank: "",
  maxDomainRank: "",
  minLinkAuthority: "",
  maxLinkAuthority: "",
  minSpamScore: "",
  maxSpamScore: "",
  linkType: "",
  hideLost: "",
  hideBroken: "",
};

export const EMPTY_REFERRING_DOMAINS_FILTERS: ReferringDomainsFilterValues = {
  include: "",
  exclude: "",
  minBacklinks: "",
  maxBacklinks: "",
  minRank: "",
  maxRank: "",
  minSpamScore: "",
  maxSpamScore: "",
};

export const EMPTY_TOP_PAGES_FILTERS: TopPagesFilterValues = {
  include: "",
  exclude: "",
  minBacklinks: "",
  maxBacklinks: "",
  minReferringDomains: "",
  maxReferringDomains: "",
  minRank: "",
  maxRank: "",
};

export const BACKLINKS_FILTER_FIELDS = [
  "include",
  "exclude",
  "minDomainRank",
  "maxDomainRank",
  "minLinkAuthority",
  "maxLinkAuthority",
  "minSpamScore",
  "maxSpamScore",
  "linkType",
  "hideLost",
  "hideBroken",
] as const satisfies ReadonlyArray<keyof BacklinksTabFilterValues>;
export const REFERRING_DOMAINS_FILTER_FIELDS = [
  "include",
  "exclude",
  "minBacklinks",
  "maxBacklinks",
  "minRank",
  "maxRank",
  "minSpamScore",
  "maxSpamScore",
] as const satisfies ReadonlyArray<keyof ReferringDomainsFilterValues>;
export const TOP_PAGES_FILTER_FIELDS = [
  "include",
  "exclude",
  "minBacklinks",
  "maxBacklinks",
  "minReferringDomains",
  "maxReferringDomains",
  "minRank",
  "maxRank",
] as const satisfies ReadonlyArray<keyof TopPagesFilterValues>;

export function countActiveFilters(values: Record<string, string>): number {
  return Object.values(values).filter((v) => v.trim() !== "").length;
}

/**
 * Mirrors how the server translates filters to DataForSEO conditions: each
 * include/exclude term is one condition, every other non-empty field is one.
 * Used to enforce DataForSEO's per-request condition budget before applying.
 */
export function countFilterConditions(values: Record<string, string>): number {
  let n = 0;
  for (const [key, value] of Object.entries(values)) {
    if (key === "include" || key === "exclude") {
      for (const term of value.split(/[,+]/)) if (term.trim()) n += 1;
      continue;
    }
    if (value.trim() !== "") n += 1;
  }
  return n;
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toBacklinksFiltersPayload(
  values: BacklinksTabFilterValues,
): BacklinksRowsFilters {
  return {
    include: values.include.trim() || undefined,
    exclude: values.exclude.trim() || undefined,
    minDomainRank: toNumberOrUndefined(values.minDomainRank),
    maxDomainRank: toNumberOrUndefined(values.maxDomainRank),
    minLinkAuthority: toNumberOrUndefined(values.minLinkAuthority),
    maxLinkAuthority: toNumberOrUndefined(values.maxLinkAuthority),
    minSpamScore: toNumberOrUndefined(values.minSpamScore),
    maxSpamScore: toNumberOrUndefined(values.maxSpamScore),
    linkType:
      values.linkType === "dofollow" || values.linkType === "nofollow"
        ? values.linkType
        : undefined,
    hideLost: values.hideLost === "true" ? true : undefined,
    hideBroken: values.hideBroken === "true" ? true : undefined,
  };
}

export function toReferringDomainsFiltersPayload(
  values: ReferringDomainsFilterValues,
): ReferringDomainsFilters {
  return {
    include: values.include.trim() || undefined,
    exclude: values.exclude.trim() || undefined,
    minBacklinks: toNumberOrUndefined(values.minBacklinks),
    maxBacklinks: toNumberOrUndefined(values.maxBacklinks),
    minRank: toNumberOrUndefined(values.minRank),
    maxRank: toNumberOrUndefined(values.maxRank),
    minSpamScore: toNumberOrUndefined(values.minSpamScore),
    maxSpamScore: toNumberOrUndefined(values.maxSpamScore),
  };
}

export function toTopPagesFiltersPayload(
  values: TopPagesFilterValues,
): TopPagesFilters {
  return {
    include: values.include.trim() || undefined,
    exclude: values.exclude.trim() || undefined,
    minBacklinks: toNumberOrUndefined(values.minBacklinks),
    maxBacklinks: toNumberOrUndefined(values.maxBacklinks),
    minReferringDomains: toNumberOrUndefined(values.minReferringDomains),
    maxReferringDomains: toNumberOrUndefined(values.maxReferringDomains),
    minRank: toNumberOrUndefined(values.minRank),
    maxRank: toNumberOrUndefined(values.maxRank),
  };
}
