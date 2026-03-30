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

type DomainControlsFormApi = {
  state: {
    values: DomainControlsValues;
  };
  handleSubmit: () => Promise<unknown>;
  reset: (values: DomainControlsValues) => void;
  setFieldValue: (
    field: keyof DomainControlsValues,
    value: string | boolean,
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
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );
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

  const controlsForm = useForm({
    defaultValues: {
      domain: searchState.domain,
      subdomains: searchState.subdomains,
      sort: searchState.sort,
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
      });

      formApi.setErrorMap({
        onSubmit: submitError
          ? createFormValidationErrors({ form: submitError })
          : undefined,
      });
    },
  });

  useSyncRouteState({ controlsForm, searchState, setPendingSearch, navigate });
  const domainMutation = useDomainLookupMutation();
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

  const runSearch = useSearchRunner({
    controlsForm,
    setPendingSearch,
    setSearchParams,
    domainMutation,
    addSearch,
    setOverview: (value) => setOverview(value),
    setSelectedKeywords,
    currentState: searchState,
    currentSortOrder,
  });

  const handlers = useDomainControllerHandlers({
    controlsForm,
    currentSortOrder,
    currentState: searchState,
    dataState,
    projectId,
    runSearch,
    saveMutation,
    selectedKeywords,
    setSearchParams,
  });

  return {
    controlsForm,
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
  controlsForm,
  currentSortOrder,
  currentState,
  dataState,
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

  const handleHistorySelect = (item: DomainSearchHistoryItem) => {
    controlsForm.reset({
      domain: item.domain,
      subdomains: item.subdomains,
      sort: item.sort,
    });
    void runSearch({
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
    void controlsForm.handleSubmit();
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
