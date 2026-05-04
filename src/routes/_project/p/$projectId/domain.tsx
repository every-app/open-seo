import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DomainOverviewPage } from "@/client/features/domain/DomainOverviewPage";
import {
  resolveSortOrder,
  toSortMode,
  toSortOrder,
} from "@/client/features/domain/utils";
import {
  DEFAULT_LOCATION_CODE,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";
import {
  DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  domainSearchSchema,
} from "@/types/schemas/domain";
import {
  EMPTY_DOMAIN_FILTERS,
  type DomainFilterValues,
} from "@/client/features/domain/types";

export const Route = createFileRoute("/_project/p/$projectId/domain")({
  validateSearch: domainSearchSchema,
  component: DomainOverviewRoute,
});

function numberToFilterString(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

function DomainOverviewRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const {
    domain = "",
    subdomains = true,
    sort = "rank",
    order,
    tab = "keywords",
    search: searchTerm = "",
    loc,
    page,
    size,
  } = search;

  const normalizedSort = toSortMode(sort) ?? "rank";
  const normalizedOrder = resolveSortOrder(
    normalizedSort,
    toSortOrder(order ?? null),
  );
  const normalizedLocationCode =
    loc != null && isSupportedLocationCode(loc) ? loc : DEFAULT_LOCATION_CODE;
  const normalizedPage = page != null && page > 0 ? page : 1;
  const normalizedPageSize = size ?? DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE;

  const appliedFilters: DomainFilterValues = {
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
  };

  return (
    <DomainOverviewPage
      projectId={projectId}
      onShowRecentSearches={() => {
        void navigate({
          search: () => ({}),
          replace: true,
        });
      }}
      navigate={navigate}
      searchState={{
        domain,
        subdomains,
        sort: normalizedSort,
        order: normalizedOrder,
        tab,
        search: searchTerm,
        locationCode: normalizedLocationCode,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        appliedFilters,
      }}
    />
  );
}
