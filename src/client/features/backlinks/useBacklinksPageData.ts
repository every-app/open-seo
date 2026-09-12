import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  BacklinksPageProps,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  getBacklinksOverview,
  getBacklinksReferringDomains,
  getBacklinksRows,
  getBacklinksTopPages,
} from "@/serverFunctions/backlinks";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import {
  BACKLINKS_DEFAULT_SORT,
  backlinksRowsSortFieldSchema,
  referringDomainsSortFieldSchema,
  topPagesSortFieldSchema,
  type BacklinksSortOrder,
} from "@/types/schemas/backlinks";
import {
  toBacklinksFiltersPayload,
  toReferringDomainsFiltersPayload,
  toTopPagesFiltersPayload,
} from "./backlinksFilterTypes";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import { getPersistedBacklinksSearchScope } from "./backlinksSearchScope";

type UseBacklinksPageDataArgs = {
  projectId: string;
  searchState: BacklinksSearchState;
  filters: BacklinksFiltersState;
};

// Five-minute client staleness on top of the server's 6h R2 cache, so window
// refocus doesn't re-run the server functions for bytes that can't change.
const BACKLINKS_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

function getBacklinksErrorMessage(
  error: unknown,
  fallback: string,
): string | null {
  if (!error) return null;
  if (getErrorCode(error) === "VALIDATION_ERROR") {
    return "Enter a valid domain or page URL.";
  }

  return getStandardErrorMessage(error, fallback);
}

/**
 * Maps the URL's sort/order params to a request's sortField/sortOrder pair.
 * The sort param is checked against the tab's allowed sort fields; anything
 * unexpected falls back to the tab's default sort.
 */
function toSort<T extends string>(
  sortParam: string | undefined,
  orderParam: BacklinksSortOrder | undefined,
  allowedFields: readonly T[],
  fallback: { field: T; order: BacklinksSortOrder },
): { field: T; order: BacklinksSortOrder } {
  const field = sortParam
    ? allowedFields.find((candidate) => candidate === sortParam)
    : undefined;
  if (!field) return fallback;
  return { field, order: orderParam ?? "desc" };
}

export function useBacklinksPageData({
  projectId,
  searchState,
  filters,
}: UseBacklinksPageDataArgs) {
  const searchCardInitialValues = useMemo(
    () => ({
      target: searchState.target,
      scope: searchState.scope,
    }),
    [searchState.scope, searchState.target],
  );

  const { target, scope, tab, page, pageSize, sort, order, view } = searchState;
  const rowsMode = view === "all" ? "as_is" : "one_per_domain";
  const targetReady = Boolean(target);
  const baseQueryKeyParts = [projectId, scope, target] as const;
  const pageInputBase = { projectId, target, scope, page, pageSize };

  const overviewQuery = useQuery({
    queryKey: ["backlinksOverview", ...baseQueryKeyParts],
    enabled: targetReady,
    staleTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: async () => {
      const opId = globalTraceStore.startOperation({
        feature: "backlinks",
        operation: "backlinks.overview",
        source: "Backlinks page",
        projectId,
        status: "running",
        billing: "Paid",
        metered: true,
        budget: "PASS",
        cache: "HIT",
        provider: "DataForSEO",
        metadata: { target, scope },
      });

      try {
        const result = await getBacklinksOverview({
          data: { projectId, target, scope },
        });

        globalTraceStore.completeOperation(opId, {
          status: "success",
          httpStatus: 200,
          providerCalls: 1,
          providerBreakdown: [{ provider: "DataForSEO", count: 1 }],
          providers: [
            {
              provider: "DataForSEO",
              endpoint: "v3/backlinks/summary/live",
              httpStatus: 200,
              taskStatus: 20000,
              transport: "HTTP",
              billing: "Paid",
              metered: true,
              budgetGuard: "PASS",
            },
          ],
        });

        return result;
      } catch (err) {
        globalTraceStore.completeOperation(opId, {
          status: "failed",
          httpStatus: 500,
          errorMessage:
            err instanceof Error
              ? err.message
              : "Failed to load backlinks overview",
        });
        throw err;
      }
    },
  });

  const rowsSort = toSort(
    sort,
    order,
    backlinksRowsSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.backlinks,
  );
  const rowsFilters = useMemo(
    () => toBacklinksFiltersPayload(filters.backlinks.values),
    [filters.backlinks.values],
  );
  const rowsQuery = useQuery({
    queryKey: [
      "backlinksRows",
      ...baseQueryKeyParts,
      page,
      pageSize,
      rowsSort.field,
      rowsSort.order,
      rowsFilters,
      rowsMode,
    ],
    enabled: targetReady && tab === "backlinks",
    staleTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksRows({
        data: {
          ...pageInputBase,
          sortField: rowsSort.field,
          sortOrder: rowsSort.order,
          filters: rowsFilters,
          mode: rowsMode,
        },
      }),
  });

  const domainsSort = toSort(
    sort,
    order,
    referringDomainsSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.domains,
  );
  const domainsFilters = useMemo(
    () => toReferringDomainsFiltersPayload(filters.domains.values),
    [filters.domains.values],
  );
  const referringDomainsQuery = useQuery({
    queryKey: [
      "backlinksReferringDomains",
      ...baseQueryKeyParts,
      page,
      pageSize,
      domainsSort.field,
      domainsSort.order,
      domainsFilters,
    ],
    enabled: targetReady && tab === "domains",
    staleTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksReferringDomains({
        data: {
          ...pageInputBase,
          sortField: domainsSort.field,
          sortOrder: domainsSort.order,
          filters: domainsFilters,
        },
      }),
  });

  const pagesSort = toSort(
    sort,
    order,
    topPagesSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.pages,
  );
  const pagesFilters = useMemo(
    () => toTopPagesFiltersPayload(filters.pages.values),
    [filters.pages.values],
  );
  const topPagesQuery = useQuery({
    queryKey: [
      "backlinksTopPages",
      ...baseQueryKeyParts,
      page,
      pageSize,
      pagesSort.field,
      pagesSort.order,
      pagesFilters,
    ],
    enabled: targetReady && tab === "pages",
    staleTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksTopPages({
        data: {
          ...pageInputBase,
          sortField: pagesSort.field,
          sortOrder: pagesSort.order,
          filters: pagesFilters,
        },
      }),
  });

  const overviewErrorMessage = getBacklinksErrorMessage(
    overviewQuery.error,
    "Could not load backlinks data.",
  );
  const activeTabQuery =
    tab === "backlinks"
      ? rowsQuery
      : tab === "domains"
        ? referringDomainsQuery
        : topPagesQuery;
  const activeTabErrorMessage = getBacklinksErrorMessage(
    activeTabQuery.error,
    "Could not load this tab.",
  );

  return {
    activeTabErrorMessage,
    activeTabQuery,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    rowsQuery,
    searchCardInitialValues,
    topPagesQuery,
  };
}

export function navigateToBacklinksSearch(
  navigate: BacklinksPageProps["navigate"],
  values: Pick<BacklinksSearchState, "target" | "scope">,
) {
  navigate({
    search: (prev) => ({
      ...prev,
      target: values.target,
      scope: getPersistedBacklinksSearchScope(values.target, values.scope),
      tab: undefined,
      page: undefined,
      sort: undefined,
      order: undefined,
    }),
    replace: true,
  });
}
