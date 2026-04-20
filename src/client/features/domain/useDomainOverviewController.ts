import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useForm } from "@tanstack/react-form";
import { type QueryClient } from "@tanstack/react-query";
import {
  useDomainSearchHistory,
  type DomainSearchHistoryItem,
} from "@/client/hooks/useDomainSearchHistory";
import {
  getDefaultSortOrder,
  normalizeDomainTarget,
  resolveSortOrder,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import type {
  DomainControlsValues,
  DomainOverviewData,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import { saveSelectedKeywords } from "@/client/features/domain/domainActions";
import { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import { useDomainFilters } from "@/client/features/domain/hooks/useDomainFilters";
import {
  useDomainLookupMutation,
  useOverviewDataState,
  useSearchRunner,
  useSyncRouteState,
  type SearchState,
} from "@/client/features/domain/domainOverviewControllerInternals";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";

type Params = {
  projectId: string;
  queryClient: QueryClient;
  navigate: (args: {
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace: boolean;
  }) => void;
  searchState: SearchState;
};

type DomainControlsFormApi = {
  state: {
    values: DomainControlsValues;
  };
  handleSubmit: () => Promise<unknown>;
  reset: (values: DomainControlsValues) => void;
  setFieldValue: (
    field: keyof DomainControlsValues,
    value: string | boolean | number,
  ) => void;
};

function getDomainSearchValidationErrors(value: DomainControlsValues) {
  if (!value.domain.trim()) {
    return createFormValidationErrors({
      fields: {
        domain: "Please enter a domain",
      },
    });
  }

  if (!normalizeDomainTarget(value.domain)) {
    return createFormValidationErrors({
      fields: {
        domain: "Please enter a valid URL or domain (e.g. browserbase.com)",
      },
    });
  }

  return null;
}

function getDomainSearchChangeValidationErrors(
  value: DomainControlsValues,
  shouldValidateUntouchedField: boolean,
  shouldValidateFormat: boolean,
) {
  if (!value.domain.trim()) {
    if (!shouldValidateUntouchedField) {
      return null;
    }

    return createFormValidationErrors({
      fields: {
        domain: "Please enter a domain",
      },
    });
  }

  if (!shouldValidateFormat) {
    return null;
  }

  return getDomainSearchValidationErrors(value);
}

export function useDomainOverviewController({
  projectId,
  queryClient,
  navigate,
  searchState,
}: Params) {
  const [pendingSearch, setPendingSearch] = useState(searchState.search);
  const [overview, setOverview] = useState<DomainOverviewData | null>(null);
  const [overviewLocationCode, setOverviewLocationCode] = useState<
    number | null
  >(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );
  const [showFilters, setShowFilters] = useState(false);
  const domainFilters = useDomainFilters();
  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useDomainSearchHistory(projectId);

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

  const controlsForm = useForm({
    defaultValues: {
      domain: searchState.domain,
      subdomains: searchState.subdomains,
      sort: searchState.sort,
      locationCode: searchState.locationCode,
    },
    validators: {
      onChange: ({ formApi, value }) =>
        getDomainSearchChangeValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "domain"),
          formApi.state.submissionAttempts > 0,
        ),
      onSubmit: ({ value }) => getDomainSearchValidationErrors(value),
    },
    onSubmit: async ({ formApi, value }) => {
      const submitError = await runSearch({
        domain: value.domain,
        subdomains: value.subdomains,
        sort: value.sort,
        order: currentSortOrder,
        tab: searchState.tab,
        search: searchState.search,
        locationCode: value.locationCode,
      });

      formApi.setErrorMap({
        onSubmit: submitError
          ? createFormValidationErrors({ form: submitError })
          : undefined,
      });
    },
  });

  useSyncRouteState({ controlsForm, searchState, setPendingSearch, navigate });
  const domainMutation = useDomainLookupMutation(projectId);
  const saveMutation = useSaveKeywordsMutation({ projectId, queryClient });
  const dataState = useOverviewDataState({
    overview,
    pendingSearch,
    filters: domainFilters.values,
    sortMode: searchState.sort,
    currentSortOrder,
    setSelectedKeywords,
  });

  useEffect(() => {
    setSearchParams({ search: pendingSearch.trim() || undefined });
  }, [pendingSearch, setSearchParams]);

  const runSearch = useSearchRunner({
    controlsForm,
    setPendingSearch,
    setSearchParams,
    domainMutation,
    addSearch,
    setOverview: (value, locationCode) => {
      setOverview(value);
      setOverviewLocationCode(locationCode);
    },
    setSelectedKeywords,
    currentState: searchState,
    currentSortOrder,
  });

  const handlers = useDomainControllerHandlers({
    controlsForm,
    currentSortOrder,
    currentState: searchState,
    dataState,
    overviewLocationCode,
    projectId,
    runSearch,
    saveMutation,
    selectedKeywords,
    setSearchParams,
  });

  const canSaveKeywords =
    overviewLocationCode !== null &&
    overviewLocationCode === controlsForm.state.values.locationCode;

  const resetView = useCallback(() => {
    setOverview(null);
    setOverviewLocationCode(null);
    setPendingSearch("");
    setSelectedKeywords(new Set());
    setShowFilters(false);
    domainFilters.resetFilters();
  }, [domainFilters]);

  return {
    controlsForm,
    isLoading: domainMutation.isPending,
    overview,
    canSaveKeywords,
    history,
    historyLoaded,
    removeHistoryItem,
    pendingSearch,
    setPendingSearch,
    selectedKeywords,
    currentSortOrder,
    setSearchParams,
    showFilters,
    setShowFilters,
    filtersForm: domainFilters.filtersForm,
    resetView,
    resetFilters: domainFilters.resetFilters,
    ...handlers,
    ...dataState,
  };
}

function useDomainControllerHandlers({
  controlsForm,
  currentSortOrder,
  currentState,
  dataState,
  overviewLocationCode,
  projectId,
  runSearch,
  saveMutation,
  selectedKeywords,
  setSearchParams,
}: {
  controlsForm: DomainControlsFormApi;
  currentSortOrder: SortOrder;
  currentState: SearchState;
  dataState: ReturnType<typeof useOverviewDataState>;
  overviewLocationCode: number | null;
  projectId: string;
  runSearch: ReturnType<typeof useSearchRunner>;
  saveMutation: ReturnType<typeof useSaveKeywordsMutation>;
  selectedKeywords: Set<string>;
  setSearchParams: (
    updates: Record<string, string | number | boolean | undefined>,
  ) => void;
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

  const applyLocationChange = useCallback(
    (nextLocationCode: number) => {
      if (!isSupportedLocationCode(nextLocationCode)) return;
      controlsForm.setFieldValue("locationCode", nextLocationCode);
      setSearchParams({
        loc:
          nextLocationCode === DEFAULT_LOCATION_CODE
            ? undefined
            : nextLocationCode,
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

  const handleSaveKeywords = () => {
    if (overviewLocationCode === null) return;
    saveSelectedKeywords({
      selectedKeywords,
      filteredKeywords: dataState.filteredKeywords,
      save: saveMutation.mutate,
      projectId,
      locationCode: overviewLocationCode,
      languageCode: getLanguageCode(overviewLocationCode),
    });
  };

  const handleHistorySelect = (item: DomainSearchHistoryItem) => {
    const historyLocation =
      item.locationCode != null && isSupportedLocationCode(item.locationCode)
        ? item.locationCode
        : DEFAULT_LOCATION_CODE;
    controlsForm.reset({
      domain: item.domain,
      subdomains: item.subdomains,
      sort: item.sort,
      locationCode: historyLocation,
    });
    void runSearch({
      domain: item.domain,
      subdomains: item.subdomains,
      sort: item.sort,
      order: getDefaultSortOrder(item.sort),
      tab: item.tab,
      search: item.search ?? "",
      locationCode: historyLocation,
    });
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    void controlsForm.handleSubmit();
  };

  return {
    applySort,
    applyLocationChange,
    handleSortColumnClick,
    handleSaveKeywords,
    runSearch,
    handleSearchSubmit,
    handleHistorySelect,
  };
}
