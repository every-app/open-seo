import { useCallback, type FormEvent } from "react";
import { useKeywordControlsForm } from "@/client/features/keywords/hooks/useKeywordControlsForm";
import { useKeywordFiltering } from "@/client/features/keywords/hooks/useKeywordFiltering";
import { useLocalKeywordFilters } from "@/client/features/keywords/hooks/useLocalKeywordFilters";
import { useKeywordResearchData } from "@/client/features/keywords/hooks/useKeywordResearchData";
import { useKeywordSelection } from "@/client/features/keywords/hooks/useKeywordSelection";
import { useKeywordSerpAnalysis } from "@/client/features/keywords/hooks/useKeywordSerpAnalysis";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSearchHistory } from "@/client/hooks/useSearchHistory";
import {
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import {
  getNextSortParams,
  parseKeywordInput,
  useSaveAndExportActions,
} from "./keywordControllerActions";
import {
  useKeywordSaveMutation,
  useKeywordSearchParams,
  useKeywordUiState,
  useResolvedKeywordLocation,
} from "./keywordControllerInternals";
import { useKeywordOverviewState } from "./useKeywordOverviewState";

export type KeywordResearchControllerInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number;
  hasExplicitLocationCode: boolean;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  sortField: SortField;
  sortDir: SortDir;
};

export function useKeywordResearchController(
  input: KeywordResearchControllerInput,
) {
  const state = useKeywordControllerState(input);
  const controlsForm = state.controlsForm;
  const setSearchParams = state.setSearchParams;

  const onSearch = useCallback(
    (overrides?: Partial<{ keyword: string; locationCode: number }>) => {
      if (overrides?.keyword !== undefined) {
        controlsForm.setFieldValue("keyword", overrides.keyword);
      }

      if (overrides?.locationCode !== undefined) {
        controlsForm.setFieldValue("locationCode", overrides.locationCode);
      }

      void controlsForm.handleSubmit();
    },
    [controlsForm],
  );

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

  const { handleSaveKeywords, confirmSave, exportCsv } =
    useSaveAndExportActions({
      selectedRows: state.selectedRows,
      rows: state.rows,
      filteredRows: state.filteredRows,
      input,
      saveKeywordsMutate: state.saveMutation.mutate,
      setShowSaveDialog: state.setShowSaveDialog,
    });

  const handleToggleAllRows = () => {
    state.toggleAllRows(state.filteredRows.map((row) => row.keyword));
  };

  const handleRowClick = (row: KeywordResearchRow) => {
    captureClientEvent("keyword_research:serp_open");
    state.setSelectedKeyword(row);
    state.setSerpKeyword(row.keyword);
    state.setSerpPage(0);
  };

  const resetView = useCallback(() => {
    state.resetResearch();
    state.clearSelection();
    state.resetFilters();
    state.setSelectedKeyword(null);
    state.setSerpKeyword(null);
    state.setSerpPage(0);
    state.setMobileTab("keywords");
    state.setShowFilters(false);
    state.setShowSaveDialog(false);
  }, [state]);

  return {
    activeFilterCount: state.activeFilterCount,
    activeSerpKeyword: state.activeSerpKeyword,
    confirmSave,
    controlsForm: state.controlsForm,
    exportCsv,
    filteredRows: state.filteredRows,
    filtersForm: state.filtersForm,
    handleRowClick,
    handleSaveKeywords,
    handleSearchSubmit,
    hasSearched: state.hasSearched,
    history: state.history,
    historyLoaded: state.historyLoaded,
    isLoading: state.isLoading,
    lastResultSource: state.lastResultSource,
    lastSearchError: state.lastSearchError,
    lastSearchKeyword: state.lastSearchKeyword,
    lastSearchLocationCode: state.lastSearchLocationCode,
    lastUsedFallback: state.lastUsedFallback,
    mobileTab: state.mobileTab,
    onSearch,
    overviewKeyword: state.overviewKeyword,
    removeHistoryItem: state.removeHistoryItem,
    researchError: state.researchError,
    resetView,
    resetFilters: state.resetFilters,
    rows: state.rows,
    searchedKeyword: state.searchedKeyword,
    selectedRows: state.selectedRows,
    serpError: state.serpError,
    serpLoading: state.serpLoading,
    serpPage: state.serpPage,
    serpQuery: state.serpQuery,
    serpResults: state.serpResults,
    setMobileTab: state.setMobileTab,
    setSerpPage: state.setSerpPage,
    setShowFilters: state.setShowFilters,
    setShowSaveDialog: state.setShowSaveDialog,
    showApproximateMatchNotice: state.showApproximateMatchNotice,
    showFilters: state.showFilters,
    showSaveDialog: state.showSaveDialog,
    sortDir: input.sortDir,
    sortField: input.sortField,
    toggleAllRows: handleToggleAllRows,
    toggleRowSelection: state.toggleRowSelection,
    toggleSort,
    SERP_PAGE_SIZE: state.SERP_PAGE_SIZE,
  };
}

function useKeywordControllerState(input: KeywordResearchControllerInput) {
  const { locationCode, setPreferredLocationCode } =
    useResolvedKeywordLocation(input);
  const {
    filtersForm,
    values: filterValues,
    resetFilters,
  } = useLocalKeywordFilters();
  const uiState = useKeywordUiState(
    Object.values(filterValues).some((v) => v.trim() !== ""),
  );
  const { selectedRows, clearSelection, toggleRowSelection, toggleAllRows } =
    useKeywordSelection();
  const {
    setSerpKeyword,
    serpPage,
    setSerpPage,
    SERP_PAGE_SIZE,
    serpQuery,
    serpResults,
    activeSerpKeyword,
    serpLoading,
    serpError,
  } = useKeywordSerpAnalysis(input.projectId, locationCode);

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
    lastResultSource,
    lastUsedFallback,
    lastSearchKeyword,
    lastSearchLocationCode,
    researchError,
    searchedKeyword,
    isLoading,
    beginSearch,
    resetResearch,
    runSearch,
  } = useKeywordResearchData(addSearch);
  const setSearchParams = useKeywordSearchParams();
  const saveMutation = useKeywordSaveMutation(input.projectId);

  const controlsForm = useKeywordControlsForm(
    {
      ...input,
      locationCode,
    },
    (value) => {
      const keywords = parseKeywordInput(value.keyword);
      const activeLocation = value.locationCode;
      const activeResultLimit = value.resultLimit;
      const activeMode = value.mode;

      setPreferredLocationCode(activeLocation);
      setSearchParams({
        q: value.keyword,
        loc:
          input.hasExplicitLocationCode ||
          activeLocation !== DEFAULT_LOCATION_CODE
            ? activeLocation
            : undefined,
        kLimit: activeResultLimit === 150 ? undefined : activeResultLimit,
        mode: activeMode === "auto" ? undefined : activeMode,
      });

      uiState.setSelectedKeyword(null);
      clearSelection();
      setSerpKeyword(null);
      beginSearch(keywords[0] ?? "", activeLocation);

      runSearch(
        {
          projectId: input.projectId,
          keywords,
          locationCode: activeLocation,
          resultLimit: activeResultLimit,
          mode: activeMode,
        },
        {
          onSuccess: (seedKeyword, nextRows) => {
            if (nextRows.length === 0) {
              setSerpKeyword(null);
              return;
            }
            setSerpKeyword(seedKeyword);
            setSerpPage(0);
          },
        },
      );
    },
  );

  const { filteredRows, activeFilterCount } = useKeywordFiltering({
    rows,
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

  return {
    activeFilterCount,
    activeSerpKeyword,
    beginSearch,
    clearSelection,
    controlsForm,
    filteredRows,
    filtersForm,
    hasSearched,
    history,
    historyLoaded,
    isLoading,
    lastResultSource,
    lastSearchError,
    lastSearchKeyword,
    lastSearchLocationCode,
    lastUsedFallback,
    mobileTab: uiState.mobileTab,
    overviewKeyword,
    removeHistoryItem,
    resetResearch,
    researchError,
    runSearch,
    resetFilters,
    rows,
    searchedKeyword,
    selectedKeyword: uiState.selectedKeyword,
    selectedRows,
    saveMutation,
    setPreferredLocationCode,
    setSelectedKeyword: uiState.setSelectedKeyword,
    setSearchParams,
    setSerpKeyword,
    serpError,
    serpLoading,
    serpPage,
    serpQuery,
    serpResults,
    setMobileTab: uiState.setMobileTab,
    setSerpPage,
    setShowFilters: uiState.setShowFilters,
    setShowSaveDialog: uiState.setShowSaveDialog,
    showApproximateMatchNotice,
    showFilters: uiState.showFilters,
    showSaveDialog: uiState.showSaveDialog,
    toggleAllRows,
    toggleRowSelection,
    SERP_PAGE_SIZE,
  };
}
