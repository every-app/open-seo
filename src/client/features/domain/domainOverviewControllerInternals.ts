import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { UpdateMetaOptions } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { sortBy } from "remeda";
import { toast } from "sonner";
import { getDomainOverview } from "@/serverFunctions/domain";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { filterAndSortKeywords } from "@/client/features/domain/domainFiltering";
import {
  getDefaultSortOrder,
  normalizeDomainTarget,
  sortableNullableNumber,
  toPageSortMode,
  toSortMode,
  toSortOrder,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import type {
  DomainActiveTab,
  DomainFilterValues,
  DomainOverviewData,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import type { DomainSearchHistoryItem } from "@/client/hooks/useDomainSearchHistory";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";

export type SearchState = {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  order?: SortOrder;
  tab: DomainActiveTab;
  search: string;
  locationCode: number;
};

type DomainNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

type DomainControlsFormAccess = {
  state: {
    values: {
      domain: string;
      subdomains: boolean;
      sort: DomainSortMode;
      locationCode: number;
    };
  };
  reset: (values: {
    domain: string;
    subdomains: boolean;
    sort: DomainSortMode;
    locationCode: number;
  }) => void;
  setFieldValue: (
    field: "domain" | "subdomains" | "sort" | "locationCode",
    updater: string | boolean | number,
    opts?: UpdateMetaOptions,
  ) => void;
};

type ControlsFormLike = DomainControlsFormAccess;

export function useOverviewDataState({
  overview,
  pendingSearch,
  filters,
  sortMode,
  currentSortOrder,
  setSelectedKeywords,
}: {
  overview: DomainOverviewData | null;
  pendingSearch: string;
  filters: DomainFilterValues;
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  setSelectedKeywords: Dispatch<SetStateAction<Set<string>>>;
}) {
  const filteredKeywords = useMemo(
    () =>
      filterAndSortKeywords({
        keywords: overview?.keywords ?? [],
        pendingSearch,
        filters,
        sortMode,
        currentSortOrder,
      }),
    [currentSortOrder, filters, overview?.keywords, pendingSearch, sortMode],
  );

  const filteredPages = useMemo(() => {
    const source = overview?.pages ?? [];
    const filtered = !pendingSearch
      ? source
      : source.filter((row) => {
          const text = `${row.relativePath ?? ""} ${row.page}`.toLowerCase();
          return text.includes(pendingSearch.toLowerCase().trim());
        });

    const pageSortMode = toPageSortMode(sortMode);
    if (pageSortMode === "volume") {
      return sortBy(filtered, [
        (row) => sortableNullableNumber(row.keywords, currentSortOrder),
        currentSortOrder,
      ]);
    }

    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.organicTraffic, currentSortOrder),
      currentSortOrder,
    ]);
  }, [currentSortOrder, overview?.pages, pendingSearch, sortMode]);

  const visibleKeywords = useMemo(
    () => filteredKeywords.slice(0, 100).map((row) => row.keyword),
    [filteredKeywords],
  );

  useEffect(() => {
    const visibleSet = new Set(visibleKeywords);
    setSelectedKeywords((prev) => {
      const next = new Set(
        [...prev].filter((keyword) => visibleSet.has(keyword)),
      );
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [setSelectedKeywords, visibleKeywords]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value.trim() !== "").length,
    [filters],
  );

  return {
    filteredKeywords,
    filteredPages,
    visibleKeywords,
    activeFilterCount,
    toggleKeywordSelection: (keyword: string) => {
      setSelectedKeywords((prev) => {
        const next = new Set(prev);
        if (next.has(keyword)) next.delete(keyword);
        else next.add(keyword);
        return next;
      });
    },
    toggleAllVisibleKeywords: () => {
      setSelectedKeywords((prev) => {
        if (
          visibleKeywords.length > 0 &&
          visibleKeywords.every((keyword) => prev.has(keyword))
        ) {
          return new Set();
        }

        return new Set(visibleKeywords);
      });
    },
  };
}

export function useSyncRouteState({
  controlsForm,
  searchState,
  setPendingSearch,
  navigate,
}: {
  controlsForm: ControlsFormLike;
  searchState: SearchState;
  setPendingSearch: (value: string) => void;
  navigate: DomainNavigate;
}) {
  useEffect(() => {
    controlsForm.reset({
      domain: searchState.domain,
      subdomains: searchState.subdomains,
      sort: searchState.sort,
      locationCode: searchState.locationCode,
    });
    setPendingSearch(searchState.search);
  }, [controlsForm, searchState, setPendingSearch]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search);
    const rawSort = toSortMode(raw.get("sort"));
    const rawOrder = toSortOrder(raw.get("order"));
    const rawLoc = raw.get("loc");
    const shouldNormalize =
      raw.get("domain") === "" ||
      raw.get("search") === "" ||
      raw.get("subdomains") === "true" ||
      raw.get("sort") === "rank" ||
      (rawOrder != null &&
        rawOrder === getDefaultSortOrder(rawSort ?? "rank")) ||
      raw.get("tab") === "keywords" ||
      rawLoc === String(DEFAULT_LOCATION_CODE);
    if (!shouldNormalize) return;

    navigate({
      search: (prev) => {
        const prevSort =
          typeof prev.sort === "string" ? toSortMode(prev.sort) : undefined;
        return {
          ...prev,
          domain: prev.domain === "" ? undefined : prev.domain,
          search: prev.search === "" ? undefined : prev.search,
          subdomains: prev.subdomains === true ? undefined : prev.subdomains,
          sort: prev.sort === "rank" ? undefined : prev.sort,
          order:
            prev.order != null &&
            prev.order === getDefaultSortOrder(prevSort ?? "rank")
              ? undefined
              : prev.order,
          tab: prev.tab === "keywords" ? undefined : prev.tab,
          loc:
            prev.loc != null && Number(prev.loc) === DEFAULT_LOCATION_CODE
              ? undefined
              : prev.loc,
        };
      },
      replace: true,
    });
  }, [navigate]);
}

export function useDomainLookupMutation(projectId: string) {
  return useMutation({
    mutationFn: (data: {
      domain: string;
      includeSubdomains: boolean;
      locationCode: number;
      languageCode: string;
    }) =>
      getDomainOverview({
        data: {
          ...data,
          projectId,
        },
      }),
  });
}

export function useSearchRunner({
  controlsForm,
  setPendingSearch,
  setSearchParams,
  domainMutation,
  addSearch,
  setOverview,
  setSelectedKeywords,
  currentState,
  currentSortOrder,
}: {
  controlsForm: ControlsFormLike;
  setPendingSearch: (value: string) => void;
  setSearchParams: (
    updates: Record<string, string | number | boolean | undefined>,
  ) => void;
  domainMutation: ReturnType<typeof useDomainLookupMutation>;
  addSearch: (item: Omit<DomainSearchHistoryItem, "timestamp">) => void;
  setOverview: (value: DomainOverviewData, locationCode: number) => void;
  setSelectedKeywords: Dispatch<SetStateAction<Set<string>>>;
  currentState: SearchState;
  currentSortOrder: SortOrder;
}) {
  return async (params?: Partial<SearchState>) => {
    const values = controlsForm.state.values;
    const rawTarget = params?.domain ?? values.domain;
    const activeSubdomains = params?.subdomains ?? values.subdomains;
    const activeSort = params?.sort ?? currentState.sort;
    const activeOrder = params?.order ?? currentSortOrder;
    const activeTab = params?.tab ?? currentState.tab;
    const activeSearch = params?.search ?? currentState.search;
    const rawLocationCode =
      params?.locationCode ?? values.locationCode ?? currentState.locationCode;
    const activeLocationCode = isSupportedLocationCode(rawLocationCode)
      ? rawLocationCode
      : DEFAULT_LOCATION_CODE;
    const activeLanguageCode = getLanguageCode(activeLocationCode);
    const target = normalizeDomainTarget(rawTarget);

    if (!target) {
      return;
    }

    setPendingSearch(activeSearch);
    controlsForm.setFieldValue("domain", target);
    controlsForm.setFieldValue("subdomains", activeSubdomains);
    controlsForm.setFieldValue("sort", activeSort);
    controlsForm.setFieldValue("locationCode", activeLocationCode);

    setSearchParams({
      domain: target,
      subdomains: activeSubdomains ? undefined : activeSubdomains,
      sort: toSortSearchParam(activeSort),
      order: toSortOrderSearchParam(activeSort, activeOrder),
      tab: activeTab === "keywords" ? undefined : activeTab,
      search: activeSearch.trim() || undefined,
      loc:
        activeLocationCode === DEFAULT_LOCATION_CODE
          ? undefined
          : activeLocationCode,
    });

    try {
      const response = await domainMutation.mutateAsync({
        domain: target,
        includeSubdomains: activeSubdomains,
        locationCode: activeLocationCode,
        languageCode: activeLanguageCode,
      });

      captureClientEvent("domain_overview:search_complete", {
        sort_mode: activeSort,
        include_subdomains: activeSubdomains,
        result_count: response.keywords.length,
        location_code: activeLocationCode,
      });

      setOverview(response, activeLocationCode);
      setSelectedKeywords(new Set());
      addSearch({
        domain: target,
        subdomains: activeSubdomains,
        sort: activeSort,
        tab: activeTab,
        search: activeSearch.trim() || undefined,
        locationCode: activeLocationCode,
      });

      if (!response.hasData) {
        toast.info("Not enough data for this domain");
      }
      return null;
    } catch (error) {
      return getStandardErrorMessage(error, "Lookup failed.");
    }
  };
}
