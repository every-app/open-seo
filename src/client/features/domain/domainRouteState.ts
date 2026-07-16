import {
  DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  type DomainSearchParams,
} from "@/types/schemas/domain";
import {
  DEFAULT_LOCATION_CODE,
  isLabsLocationCode,
} from "@/client/features/keywords/locations";
import type { ProjectMarket } from "@/client/features/projects/types";
import {
  EMPTY_DOMAIN_FILTERS,
  type DomainActiveTab,
  type DomainFilterValues,
  type DomainSortMode,
  type KeywordsFilterValues,
  type PagesFilterValues,
  type SortOrder,
} from "@/client/features/domain/types";
import {
  KEYWORD_FILTER_FIELDS,
  PAGE_FILTER_FIELDS,
  PAGE_SEARCH_PARAM_BY_FIELD,
} from "@/client/features/domain/domainFilterUtils";
import { resolveSortOrder, toSortMode, toSortOrder } from "./utils";

export type DomainOverviewRouteState = {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  order: SortOrder;
  tab: DomainActiveTab;
  defaultLocationCode: number;
  locationCode: number;
  sentLocationCode: number | undefined;
  page: number;
  pageSize: number;
  appliedFilters: DomainFilterValues;
  appliedPageFilters: PagesFilterValues;
  hasAppliedKeywordFilters: boolean;
  hasAppliedPageFilters: boolean;
};

function numberToFilterString(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

export function getDomainRouteState(
  search: DomainSearchParams,
  projectMarket?: ProjectMarket,
): DomainOverviewRouteState {
  const normalizedSort = toSortMode(search.sort ?? null) ?? "traffic";
  const defaultLocationCode =
    projectMarket && isLabsLocationCode(projectMarket.locationCode)
      ? projectMarket.locationCode
      : DEFAULT_LOCATION_CODE;
  // Domain analytics is Labs-backed; Google-Ads-only countries aren't valid.
  const normalizedLocationCode =
    search.loc != null && isLabsLocationCode(search.loc)
      ? search.loc
      : defaultLocationCode;

  return {
    domain: search.domain ?? "",
    subdomains: search.subdomains ?? true,
    sort: normalizedSort,
    order: resolveSortOrder(normalizedSort, toSortOrder(search.order ?? null)),
    tab: search.tab ?? "keywords",
    defaultLocationCode,
    locationCode: normalizedLocationCode,
    sentLocationCode: search.loc,
    page: search.page != null && search.page > 0 ? search.page : 1,
    pageSize: search.size ?? DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
    appliedFilters: {
      include: search.include ?? EMPTY_DOMAIN_FILTERS.include,
      exclude: search.exclude ?? EMPTY_DOMAIN_FILTERS.exclude,
      minTraffic: numberToFilterString(search.minTraffic),
      maxTraffic: numberToFilterString(search.maxTraffic),
      minVol: numberToFilterString(search.minVol),
      maxVol: numberToFilterString(search.maxVol),
      minCpc: numberToFilterString(search.minCpc),
      maxCpc: numberToFilterString(search.maxCpc),
      minKd: numberToFilterString(search.minKd),
      maxKd: numberToFilterString(search.maxKd),
      minRank: numberToFilterString(search.minRank),
      maxRank: numberToFilterString(search.maxRank),
    },
    appliedPageFilters: {
      include: search.pInclude ?? EMPTY_DOMAIN_FILTERS.include,
      exclude: search.pExclude ?? EMPTY_DOMAIN_FILTERS.exclude,
      minTraffic: numberToFilterString(search.pMinTraffic),
      maxTraffic: numberToFilterString(search.pMaxTraffic),
      minVol: numberToFilterString(search.pMinVol),
      maxVol: numberToFilterString(search.pMaxVol),
    },
    hasAppliedKeywordFilters: hasKeywordSearchFilters(search),
    hasAppliedPageFilters: hasPageSearchFilters(search),
  };
}

function hasKeywordSearchFilters(search: DomainSearchParams): boolean {
  return KEYWORD_FILTER_FIELDS.some(
    (key: keyof KeywordsFilterValues) => search[key] != null,
  );
}

function hasPageSearchFilters(search: DomainSearchParams): boolean {
  return PAGE_FILTER_FIELDS.some(
    (key) => search[PAGE_SEARCH_PARAM_BY_FIELD[key]] != null,
  );
}
