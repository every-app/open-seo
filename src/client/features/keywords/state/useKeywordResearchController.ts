import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useKeywordControlsForm } from "@/client/features/keywords/hooks/useKeywordControlsForm";
import { useKeywordFiltering } from "@/client/features/keywords/hooks/useKeywordFiltering";
import { useLocalKeywordFilters } from "@/client/features/keywords/hooks/useLocalKeywordFilters";
import { useKeywordResearchData } from "@/client/features/keywords/hooks/useKeywordResearchData";
import { useKeywordSelection } from "@/client/features/keywords/hooks/useKeywordSelection";
import { useKeywordSerpAnalysis } from "@/client/features/keywords/hooks/useKeywordSerpAnalysis";
import { useSearchHistory } from "@/client/hooks/useSearchHistory";
import {
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { saveKeywords } from "@/serverFunctions/keywords";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import {
  useSaveAndExportActions,
  useSearchActions,
} from "./keywordControllerActions";
import { useKeywordOverviewState } from "./useKeywordOverviewState";

export type KeywordResearchControllerInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  sortField: SortField;
  sortDir: SortDir;
};

export function useKeywordResearchController(
  input: KeywordResearchControllerInput,
) {
  const state = useKeywordControllerState(input);

  const { onSearch, handleSearchSubmit, toggleSort } = useSearchActions({
    controlsForm: state.controlsForm,
    input,
    beginSearch: state.beginSearch,
    runSearch: state.runSearch,
    clearSelection: state.clearSelection,
    setSelectedKeyword: state.setSelectedKeyword,
    setSerpKeyword: state.setSerpKeyword,
    setSerpPage: state.setSerpPage,
    setSearchInputError: state.setSearchInputError,
    setSearchParams: state.setSearchParams,
  });

  const { handleSaveKeywords, confirmSave, exportCsv } =
    useSaveAndExportActions({
      selectedRows: state.selectedRows,
      filteredRows: state.filteredRows,
      input,
      saveKeywordsMutate: state.saveMutation.mutate,
      setShowSaveDialog: state.setShowSaveDialog,
    });

  const handleToggleAllRows = () => {
    state.toggleAllRows(state.filteredRows.map((row) => row.keyword));
  };

  const handleRowClick = (row: KeywordResearchRow) => {
    state.setSelectedKeyword(row);
    state.setSerpKeyword(row.keyword);
    state.setSerpPage(0);
  };

  return buildControllerOutput({
    activeFilterCount: state.activeFilterCount,
    activeSerpKeyword: state.activeSerpKeyword,
    clearHistory: state.clearHistory,
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
    resetFilters: state.resetFilters,
    rows: state.rows,
    searchedKeyword: state.searchedKeyword,
    searchInputError: state.searchInputError,
    selectedRows: state.selectedRows,
    serpError: state.serpError,
    serpLoading: state.serpLoading,
    serpPage: state.serpPage,
    serpQuery: state.serpQuery,
    serpResults: state.serpResults,
    setMobileTab: state.setMobileTab,
    setSearchInputError: state.setSearchInputError,
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
  });
}

function useKeywordControllerState(input: KeywordResearchControllerInput) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedKeyword, setSelectedKeyword] =
    useState<KeywordResearchRow | null>(null);

  const controlsForm = useKeywordControlsForm(input);
  const {
    filtersForm,
    values: filterValues,
    resetFilters,
  } = useLocalKeywordFilters();
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
  } = useKeywordSerpAnalysis(input.locationCode);

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    clearHistory,
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
    runSearch,
  } = useKeywordResearchData(addSearch);
  const [searchInputError, setSearchInputError] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [mobileTab, setMobileTab] = useState<"keywords" | "serp">("keywords");
  const setSearchParams = useKeywordSearchParams();
  const saveMutation = useKeywordSaveMutation(input.projectId);

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
      selectedKeyword,
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
    clearHistory,
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
    mobileTab,
    overviewKeyword,
    removeHistoryItem,
    researchError,
    runSearch,
    resetFilters,
    rows,
    searchedKeyword,
    searchInputError,
    selectedKeyword,
    selectedRows,
    saveMutation,
    setSelectedKeyword,
    setSearchParams,
    setSerpKeyword,
    serpError,
    serpLoading,
    serpPage,
    serpQuery,
    serpResults,
    setMobileTab,
    setSearchInputError,
    setSerpPage,
    setShowFilters,
    setShowSaveDialog,
    showApproximateMatchNotice,
    showFilters,
    showSaveDialog,
    toggleAllRows,
    toggleRowSelection,
    SERP_PAGE_SIZE,
  };
}

function useKeywordSearchParams() {
  const navigate = useNavigate({ from: "/p/$projectId/keywords" });

  return useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );
}

function useKeywordSaveMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      languageCode: string;
    }) => saveKeywords({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });
}

function buildControllerOutput<T extends Record<string, unknown>>(state: T): T {
  return state;
}
