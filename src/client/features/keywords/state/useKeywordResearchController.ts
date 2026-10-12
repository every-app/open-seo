import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  useKeywordControlsForm,
  type KeywordControlsValues,
} from "@/client/features/keywords/hooks/useKeywordControlsForm";
import { useKeywordFiltering } from "@/client/features/keywords/hooks/useKeywordFiltering";
import { usePreferredKeywordGrouping } from "@/client/features/keywords/hooks/usePreferredKeywordGrouping";
import { useLocalKeywordFilters } from "@/client/features/keywords/hooks/useLocalKeywordFilters";
import { useKeywordResearchData } from "@/client/features/keywords/hooks/useKeywordResearchData";
import { useKeywordSerpAnalysis } from "@/client/features/keywords/hooks/useKeywordSerpAnalysis";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSearchHistory } from "@/client/hooks/useSearchHistory";
import {
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import {
  buildKeywordSearchKey,
  getNextSortParams,
  useSaveAndExportActions,
} from "./keywordControllerActions";
import {
  useKeywordSaveMutation,
  useKeywordSearchParams,
  useKeywordUiState,
} from "./keywordControllerInternals";
import { useKeywordOverviewState } from "./useKeywordOverviewState";

export type KeywordResearchControllerInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number | undefined;
  displayedLocationCode: number;
  /** City, county, or region for local volume; undefined for national. */
  locationName: string | undefined;
  setPreferredLocationCode: (locationCode: number) => void;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  clickstream: boolean;
  /** Grouping of the displayed search. The toggle only applies to new searches. */
  groupKeywords: boolean;
  sortField: SortField;
  sortDir: SortDir;
  /**
   * Called when the user submits the search form. Lets the caller decide
   * whether the submission opens tabs or just rewrites the URL — the
   * controller stays agnostic.
   */
  onFormSubmit: (value: KeywordSubmitValues) => void;
};

export type KeywordSubmitValues = KeywordControlsValues & {
  groupKeywords: boolean;
};

export function useKeywordResearchController(
  input: KeywordResearchControllerInput,
) {
  const {
    displayedLocationCode,
    groupKeywords,
    locationCode,
    setPreferredLocationCode,
  } = input;
  const {
    groupKeywords: preferredGroupKeywords,
    setGroupKeywords: setPreferredGroupKeywords,
  } = usePreferredKeywordGrouping(input.projectId);
  const {
    filtersForm,
    values: filterValues,
    resetFilters,
  } = useLocalKeywordFilters(input.projectId);
  const uiState = useKeywordUiState(
    Object.values(filterValues).some((v) => v.trim() !== ""),
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const {
    setSerpKeyword,
    serpPage,
    setSerpPage,
    SERP_PAGE_SIZE,
    serpResults,
    activeSerpKeyword,
    serpLoading,
    serpLoadingMore,
    canLoadMoreSerp,
    deepFetchFailed,
    retrySerp,
    serpError,
    serpRetrying,
  } = useKeywordSerpAnalysis(input.projectId, locationCode, input.locationName);

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useSearchHistory(input.projectId);

  const {
    rows,
    hasSearched,
    lastSearchError,
    lastSearchKeyword,
    lastSearchLocationCode,
    researchError,
    researchMutationError,
    researchQuery,
    searchedKeyword,
    isLoading,
    retryResearch,
  } = useKeywordResearchData(
    {
      projectId: input.projectId,
      keywordInput: input.keywordInput,
      locationCode,
      displayedLocationCode,
      locationName: input.locationName,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
      groupKeywords,
    },
    addSearch,
  );
  const setSearchParams = useKeywordSearchParams();
  const saveMutation = useKeywordSaveMutation(input.projectId);

  const activeSearchKey = input.keywordInput.trim()
    ? buildKeywordSearchKey({
        keyword: input.keywordInput,
        locationCode,
        locationName: input.locationName,
        resultLimit: input.resultLimit,
        mode: input.keywordMode,
        clickstream: input.clickstream,
        groupKeywords,
      })
    : null;

  const previousSearchKeyRef = useRef<string | null>(null);
  const handledSerpSearchKeyRef = useRef<string | null>(null);

  const clearActiveKeywordResult = useCallback(() => {
    setSelectedRows(new Set());
    uiState.setSelectedKeyword(null);
    setSerpKeyword(null);
    setSerpPage(0);
  }, [setSerpKeyword, setSerpPage, uiState]);

  const onFormSubmit = input.onFormSubmit;
  const controlsForm = useKeywordControlsForm(
    {
      ...input,
      locationCode: displayedLocationCode,
    },
    (value) => {
      setPreferredLocationCode(value.locationCode);
      onFormSubmit({ ...value, groupKeywords: preferredGroupKeywords });
    },
  );

  // The URL defines keyword research queries. This effect only resets UI state
  // around a new query key; TanStack Query owns the actual fetch, cache,
  // dedupe, and error lifecycle.
  useEffect(() => {
    if (activeSearchKey === previousSearchKeyRef.current) return;
    previousSearchKeyRef.current = activeSearchKey;
    handledSerpSearchKeyRef.current = null;

    clearActiveKeywordResult();
  }, [activeSearchKey, clearActiveKeywordResult]);

  useEffect(() => {
    if (!activeSearchKey || !researchQuery.isSuccess) return;
    if (handledSerpSearchKeyRef.current === activeSearchKey) return;

    handledSerpSearchKeyRef.current = activeSearchKey;
    setSerpKeyword(rows.length > 0 ? searchedKeyword : null);
    setSerpPage(0);
  }, [
    activeSearchKey,
    researchQuery.isSuccess,
    rows.length,
    searchedKeyword,
    setSerpKeyword,
    setSerpPage,
  ]);

  const { filteredRows, activeFilterCount } = useKeywordFiltering({
    groupKeywords,
    rows,
    searchedKeyword,
    filters: filterValues,
    sortField: input.sortField,
    sortDir: input.sortDir,
  });

  const { showApproximateMatchNotice, overviewKeyword } =
    useKeywordOverviewState({
      rows,
      searchedKeyword,
      selectedKeyword: uiState.selectedKeyword,
      hasSearched,
      isLoading,
      lastSearchError,
      keywordMode: input.keywordMode,
    });

  const retrySearch = useCallback(() => {
    void retryResearch();
  }, [retryResearch]);

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void controlsForm.handleSubmit();
    },
    [controlsForm],
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      setSearchParams(getNextSortParams(input.sortField, input.sortDir, field));
    },
    [input.sortDir, input.sortField, setSearchParams],
  );

  const {
    handleSaveKeywords,
    confirmSave,
    selectedKeywordRows,
    exportAll,
    exportSelection,
  } = useSaveAndExportActions({
    selectedRows,
    filteredRows,
    input,
    saveKeywordsMutate: saveMutation.mutate,
    setShowSaveDialog: uiState.setShowSaveDialog,
  });

  const handleRowClick = (row: KeywordResearchRow) => {
    captureClientEvent("keyword_research:serp_open");
    uiState.setSelectedKeyword(row);
    setSerpKeyword(row.keyword);
    setSerpPage(0);
  };

  return {
    preferredGroupKeywords,
    setPreferredGroupKeywords,
    activeFilterCount,
    activeSerpKeyword,
    confirmSave,
    controlsForm,
    exportAll,
    exportSelection,
    filteredRows,
    filtersForm,
    handleRowClick,
    handleSaveKeywords,
    handleSearchSubmit,
    hasSearched,
    history,
    historyLoaded,
    isLoading,
    lastSearchKeyword,
    lastSearchLocationCode,
    locationName: input.locationName,
    mobileTab: uiState.mobileTab,
    overviewKeyword,
    removeHistoryItem,
    researchError,
    researchMutationError,
    // `isLoading` stays false while a failed query refetches.
    researchRetrying: researchQuery.isFetching,
    retrySearch,
    resetFilters,
    retrySerp,
    rows,
    savePending: saveMutation.isPending,
    searchedKeyword,
    selectedRows,
    selectedKeywordRows,
    canLoadMoreSerp,
    deepFetchFailed,
    serpError,
    serpRetrying,
    serpLoading,
    serpLoadingMore,
    serpPage,
    serpResults,
    setMobileTab: uiState.setMobileTab,
    setSelectedRows,
    setSerpPage,
    setShowFilters: uiState.setShowFilters,
    setShowSaveDialog: uiState.setShowSaveDialog,
    showApproximateMatchNotice,
    showFilters: uiState.showFilters,
    showSaveDialog: uiState.showSaveDialog,
    sortDir: input.sortDir,
    sortField: input.sortField,
    toggleSort,
    SERP_PAGE_SIZE,
  };
}
