import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { UpdateMetaOptions } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { sortBy } from "remeda";
import { toast } from "sonner";
import { getDomainOverview } from "@/serverFunctions/domain";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
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
  DomainOverviewData,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import type { DomainSearchHistoryItem } from "@/client/hooks/useDomainSearchHistory";

export type SearchState = {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  order?: SortOrder;
  tab: DomainActiveTab;
  search: string;
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
    };
  };
  setFieldValue: (
    field: "domain" | "subdomains" | "sort",
    updater: string | boolean,
    opts?: UpdateMetaOptions,
  ) => void;
};

type ControlsFormLike = DomainControlsFormAccess;

export function useOverviewDataState({
  overview,
  pendingSearch,
  sortMode,
  currentSortOrder,
  setSelectedKeywords,
}: {
  overview: DomainOverviewData | null;
  pendingSearch: string;
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  setSelectedKeywords: Dispatch<SetStateAction<Set<string>>>;
}) {
  const filteredKeywords = useMemo(() => {
    const source = overview?.keywords ?? [];
    const filtered = !pendingSearch
      ? source
      : source.filter((row) => {
          const haystack =
            `${row.keyword} ${row.relativeUrl ?? ""}`.toLowerCase();
          return haystack.includes(pendingSearch.toLowerCase().trim());
        });

    if (sortMode === "traffic") {
      return sortBy(filtered, [
        (row) => sortableNullableNumber(row.traffic, currentSortOrder),
        currentSortOrder,
      ]);
    }

    if (sortMode === "volume") {
      return sortBy(filtered, [
        (row) => sortableNullableNumber(row.searchVolume, currentSortOrder),
        currentSortOrder,
      ]);
    }

    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.position, currentSortOrder),
      currentSortOrder,
    ]);
  }, [currentSortOrder, overview?.keywords, pendingSearch, sortMode]);

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

  return {
    filteredKeywords,
    filteredPages,
    visibleKeywords,
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
          visibleKeywords.every((k) => prev.has(k))
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
    controlsForm.setFieldValue("domain", searchState.domain);
    controlsForm.setFieldValue("subdomains", searchState.subdomains);
    controlsForm.setFieldValue("sort", searchState.sort);
    setPendingSearch(searchState.search);
  }, [controlsForm, searchState, setPendingSearch]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search);
    const rawSort = toSortMode(raw.get("sort"));
    const rawOrder = toSortOrder(raw.get("order"));
    const shouldNormalize =
      raw.get("domain") === "" ||
      raw.get("search") === "" ||
      raw.get("subdomains") === "true" ||
      raw.get("sort") === "rank" ||
      (rawOrder != null &&
        rawOrder === getDefaultSortOrder(rawSort ?? "rank")) ||
      raw.get("tab") === "keywords";
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
        };
      },
      replace: true,
    });
  }, [navigate]);
}

export function useDomainLookupMutation({
  setOverview,
  setOverviewError,
}: {
  setOverview: (value: DomainOverviewData) => void;
  setOverviewError: (value: string | null) => void;
}) {
  return useMutation({
    mutationFn: (data: {
      domain: string;
      includeSubdomains: boolean;
      locationCode: number;
      languageCode: string;
    }) => getDomainOverview({ data }),
    onError: (error) => {
      setOverviewError(getStandardErrorMessage(error, "Lookup failed."));
    },
    onSuccess: (response) => {
      setOverview(response);
      if (!response.hasData) toast.info("Not enough data for this domain");
    },
  });
}

export function useSearchRunner({
  controlsForm,
  setDomainError,
  setOverviewError,
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
  setDomainError: (value: string | null) => void;
  setOverviewError: (value: string | null) => void;
  setPendingSearch: (value: string) => void;
  setSearchParams: (
    updates: Record<string, string | boolean | undefined>,
  ) => void;
  domainMutation: ReturnType<typeof useDomainLookupMutation>["mutate"];
  addSearch: (item: Omit<DomainSearchHistoryItem, "timestamp">) => void;
  setOverview: (value: DomainOverviewData) => void;
  setSelectedKeywords: (value: Set<string>) => void;
  currentState: SearchState;
  currentSortOrder: SortOrder;
}) {
  return (params?: Partial<SearchState>) => {
    const values = controlsForm.state.values;
    const rawTarget = params?.domain ?? values.domain;
    const activeSubdomains = params?.subdomains ?? values.subdomains;
    const activeSort = params?.sort ?? currentState.sort;
    const activeOrder = params?.order ?? currentSortOrder;
    const activeTab = params?.tab ?? currentState.tab;
    const activeSearch = params?.search ?? currentState.search;

    if (!rawTarget.trim()) {
      setDomainError("Please enter a domain");
      return;
    }

    const target = normalizeDomainTarget(rawTarget);
    if (!target) {
      setDomainError(
        "Please enter a valid URL or domain (e.g. browserbase.com)",
      );
      return;
    }

    setDomainError(null);
    setOverviewError(null);
    setPendingSearch(activeSearch);
    controlsForm.setFieldValue("domain", target);
    controlsForm.setFieldValue("subdomains", activeSubdomains);
    controlsForm.setFieldValue("sort", activeSort);

    setSearchParams({
      domain: target,
      subdomains: activeSubdomains ? undefined : activeSubdomains,
      sort: toSortSearchParam(activeSort),
      order: toSortOrderSearchParam(activeSort, activeOrder),
      tab: activeTab === "keywords" ? undefined : activeTab,
      search: activeSearch.trim() || undefined,
    });

    domainMutation(
      {
        domain: target,
        includeSubdomains: activeSubdomains,
        locationCode: 2840,
        languageCode: "en",
      },
      {
        onSuccess: (response) => {
          setOverview(response);
          setSelectedKeywords(new Set());
          addSearch({
            domain: target,
            subdomains: activeSubdomains,
            sort: activeSort,
            tab: activeTab,
            search: activeSearch.trim() || undefined,
          });
        },
        onError: (error) => {
          setOverviewError(getStandardErrorMessage(error, "Lookup failed."));
        },
      },
    );
  };
}
