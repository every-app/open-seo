import { useCallback, useEffect, useState, type FormEvent } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  useDomainSearchHistory,
  type DomainSearchHistoryItem,
} from "@/client/hooks/useDomainSearchHistory";
import {
  getDefaultSortOrder,
  resolveSortOrder,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import type {
  DomainControlsValues,
  DomainOverviewData,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import { saveSelectedKeywords } from "@/client/features/domain/domainActions";
import { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import {
  useDomainLookupMutation,
  useOverviewDataState,
  useSearchRunner,
  useSyncRouteState,
  type SearchState,
} from "@/client/features/domain/domainOverviewControllerInternals";

type Params = {
  projectId: string;
  queryClient: QueryClient;
  navigate: (args: {
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace: boolean;
  }) => void;
  searchState: SearchState;
};

function useDomainControlsForm(defaultValues: DomainControlsValues) {
  return useForm({ defaultValues });
}

export function useDomainOverviewController({
  projectId,
  queryClient,
  navigate,
  searchState,
}: Params) {
  const [domainError, setDomainError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState(searchState.search);
  const [overview, setOverview] = useState<DomainOverviewData | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );
  const controlsForm = useDomainControlsForm({
    domain: searchState.domain,
    subdomains: searchState.subdomains,
    sort: searchState.sort,
  });
  const { history, isLoaded, addSearch, clearHistory, removeHistoryItem } =
    useDomainSearchHistory(projectId);

  const currentSortOrder = resolveSortOrder(
    searchState.sort,
    searchState.order,
  );
  const setSearchParams = useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  useSyncRouteState({ controlsForm, searchState, setPendingSearch, navigate });
  const domainMutation = useDomainLookupMutation({
    setOverview,
    setOverviewError,
  });
  const saveMutation = useSaveKeywordsMutation({ projectId, queryClient });
  const dataState = useOverviewDataState({
    overview,
    pendingSearch,
    sortMode: searchState.sort,
    currentSortOrder,
    setSelectedKeywords,
  });

  useEffect(() => {
    setSearchParams({ search: pendingSearch.trim() || undefined });
  }, [pendingSearch, setSearchParams]);

  const handlers = useDomainControllerHandlers({
    addSearch,
    controlsForm,
    currentSortOrder,
    currentState: searchState,
    dataState,
    domainMutation: domainMutation.mutate,
    projectId,
    saveMutation,
    selectedKeywords,
    setDomainError,
    setOverview,
    setOverviewError,
    setPendingSearch,
    setSearchParams,
    setSelectedKeywords,
  });

  return {
    controlsForm,
    domainError,
    setDomainError,
    overviewError,
    isLoading: domainMutation.isPending,
    overview,
    history,
    historyLoaded: isLoaded,
    clearHistory,
    removeHistoryItem,
    pendingSearch,
    setPendingSearch,
    selectedKeywords,
    currentSortOrder,
    setSearchParams,
    ...handlers,
    ...dataState,
  };
}

function useDomainControllerHandlers({
  addSearch,
  controlsForm,
  currentSortOrder,
  currentState,
  dataState,
  domainMutation,
  projectId,
  saveMutation,
  selectedKeywords,
  setDomainError,
  setOverview,
  setOverviewError,
  setPendingSearch,
  setSearchParams,
  setSelectedKeywords,
}: {
  addSearch: (item: Omit<DomainSearchHistoryItem, "timestamp">) => void;
  controlsForm: ReturnType<typeof useDomainControlsForm>;
  currentSortOrder: SortOrder;
  currentState: SearchState;
  dataState: ReturnType<typeof useOverviewDataState>;
  domainMutation: ReturnType<typeof useDomainLookupMutation>["mutate"];
  projectId: string;
  saveMutation: ReturnType<typeof useSaveKeywordsMutation>;
  selectedKeywords: Set<string>;
  setDomainError: (value: string | null) => void;
  setOverview: (value: DomainOverviewData | null) => void;
  setOverviewError: (value: string | null) => void;
  setPendingSearch: (value: string) => void;
  setSearchParams: (
    updates: Record<string, string | number | boolean | undefined>,
  ) => void;
  setSelectedKeywords: (value: Set<string>) => void;
}) {
  const applySort = useCallback(
    (nextSort: DomainSortMode, nextOrder: SortOrder) => {
      controlsForm.setFieldValue("sort", nextSort);
      setSearchParams({
        sort: toSortSearchParam(nextSort),
        order: toSortOrderSearchParam(nextSort, nextOrder),
      });
    },
    [controlsForm, setSearchParams],
  );

  const handleSortColumnClick = useCallback(
    (nextSort: DomainSortMode) => {
      const nextOrder =
        nextSort === currentState.sort
          ? currentSortOrder === "asc"
            ? "desc"
            : "asc"
          : getDefaultSortOrder(nextSort);
      applySort(nextSort, nextOrder);
    },
    [applySort, currentSortOrder, currentState.sort],
  );

  const handleSaveKeywords = () =>
    saveSelectedKeywords({
      selectedKeywords,
      filteredKeywords: dataState.filteredKeywords,
      save: saveMutation.mutate,
      projectId,
    });

  const runSearch = useSearchRunner({
    controlsForm,
    setDomainError,
    setOverviewError,
    setPendingSearch,
    setSearchParams,
    domainMutation,
    addSearch,
    setOverview: (value) => setOverview(value),
    setSelectedKeywords,
    currentState,
    currentSortOrder,
  });

  const handleHistorySelect = (item: DomainSearchHistoryItem) => {
    runSearch({
      domain: item.domain,
      subdomains: item.subdomains,
      sort: item.sort,
      order: getDefaultSortOrder(item.sort),
      tab: item.tab,
      search: item.search ?? "",
    });
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSearch();
  };

  return {
    applySort,
    handleSortColumnClick,
    handleSaveKeywords,
    runSearch,
    handleSearchSubmit,
    handleHistorySelect,
  };
}
