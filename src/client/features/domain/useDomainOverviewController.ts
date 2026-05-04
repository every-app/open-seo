import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDomainSearchHistory } from "@/client/hooks/useDomainSearchHistory";
import {
  normalizeDomainTarget,
  resolveSortOrder,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import { captureClientEvent } from "@/client/lib/posthog";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { KeywordRow, PageRow } from "@/client/features/domain/types";
import { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import { useDomainFilters } from "@/client/features/domain/hooks/useDomainFilters";
import { useDomainKeywordsQuery } from "@/client/features/domain/hooks/useDomainKeywordsQuery";
import { useDomainOverviewQuery } from "@/client/features/domain/hooks/useDomainOverviewQuery";
import { useDomainPagesQuery } from "@/client/features/domain/hooks/useDomainPagesQuery";
import {
  getDomainSearchChangeValidationErrors,
  getDomainSearchValidationErrors,
} from "@/client/features/domain/domainSearchValidation";
import { useDomainControllerHandlers } from "@/client/features/domain/useDomainControllerHandlers";
import {
  useOverviewDataState,
  useSyncRouteState,
  type SearchState,
} from "@/client/features/domain/domainOverviewControllerInternals";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";
import { DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE } from "@/types/schemas/domain";

type Params = {
  projectId: string;
  queryClient: QueryClient;
  navigate: (args: {
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace: boolean;
  }) => void;
  searchState: SearchState;
};

export function useDomainOverviewController({
  projectId,
  queryClient,
  navigate,
  searchState,
}: Params) {
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );
  const [showFilters, setShowFilters] = useState(false);

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

  const domainFilters = useDomainFilters({
    appliedValues: searchState.appliedFilters,
    appliedSearch: searchState.search,
    setSearchParams,
  });

  const overviewLanguageCode = getLanguageCode(searchState.locationCode);
  const overviewQuery = useDomainOverviewQuery({
    projectId,
    domain: searchState.domain,
    includeSubdomains: searchState.subdomains,
    locationCode: searchState.locationCode,
    languageCode: overviewLanguageCode,
  });
  const overview = overviewQuery.data ?? null;

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
    onSubmit: ({ formApi, value }) => {
      const target = normalizeDomainTarget(value.domain);
      if (!target) return;
      formApi.setFieldValue("domain", target);
      setSearchParams({
        domain: target,
        subdomains: value.subdomains ? undefined : false,
        sort: toSortSearchParam(value.sort),
        order: toSortOrderSearchParam(value.sort, currentSortOrder),
        tab: searchState.tab === "keywords" ? undefined : searchState.tab,
        loc:
          value.locationCode === DEFAULT_LOCATION_CODE
            ? undefined
            : value.locationCode,
        page: undefined,
        size: undefined,
      });
    },
  });

  useSyncRouteState({ controlsForm, searchState, navigate });
  const saveMutation = useSaveKeywordsMutation({ projectId, queryClient });

  // Surface overview-query errors through the form's submit error map so the
  // existing error UI keeps working without a parallel error channel.
  useEffect(() => {
    controlsForm.setErrorMap({
      onSubmit: overviewQuery.error
        ? createFormValidationErrors({
            form: getStandardErrorMessage(
              overviewQuery.error,
              "Lookup failed.",
            ),
          })
        : undefined,
    });
  }, [controlsForm, overviewQuery.error]);

  // History + analytics + "no data" toast: fire once per successful overview
  // fetch, keyed on the inputs that actually trigger a refetch.
  const lastTrackedKey = useRef<string>("");
  useEffect(() => {
    if (!overviewQuery.isSuccess || !overviewQuery.data) return;
    const key = `${searchState.domain}|${searchState.subdomains}|${searchState.locationCode}`;
    if (lastTrackedKey.current === key) return;
    lastTrackedKey.current = key;

    const data = overviewQuery.data;
    captureClientEvent("domain_overview:search_complete", {
      sort_mode: searchState.sort,
      include_subdomains: searchState.subdomains,
      result_count: data.organicKeywords ?? 0,
      location_code: searchState.locationCode,
    });
    addSearch({
      domain: searchState.domain,
      subdomains: searchState.subdomains,
      sort: searchState.sort,
      tab: searchState.tab,
      search: searchState.search.trim() || undefined,
      locationCode: searchState.locationCode,
    });
    if (!data.hasData) {
      toast.info("Not enough data for this domain");
    }
    setSelectedKeywords(new Set());
  }, [
    overviewQuery.isSuccess,
    overviewQuery.data,
    searchState.domain,
    searchState.subdomains,
    searchState.locationCode,
    searchState.sort,
    searchState.tab,
    searchState.search,
    addSearch,
  ]);

  // Reset transient panel state when the user navigates back to recent searches.
  useEffect(() => {
    if (searchState.domain.trim() === "") {
      setShowFilters(false);
      setSelectedKeywords(new Set());
      lastTrackedKey.current = "";
    }
  }, [searchState.domain]);

  const keywordsTabActive = searchState.tab === "keywords";
  const pagesTabActive = searchState.tab === "pages";

  const keywordsQuery = useDomainKeywordsQuery({
    projectId,
    domain: overview?.domain ?? "",
    includeSubdomains: searchState.subdomains,
    locationCode: searchState.locationCode,
    languageCode: overviewLanguageCode,
    page: searchState.page,
    pageSize: searchState.pageSize,
    sortMode: searchState.sort,
    sortOrder: currentSortOrder,
    appliedFilters: searchState.appliedFilters,
    searchTerm: searchState.search,
    enabled: overview !== null && overview.hasData && keywordsTabActive,
  });

  const pagesQuery = useDomainPagesQuery({
    projectId,
    domain: overview?.domain ?? "",
    includeSubdomains: searchState.subdomains,
    locationCode: searchState.locationCode,
    languageCode: overviewLanguageCode,
    page: searchState.page,
    pageSize: searchState.pageSize,
    sortMode: searchState.sort,
    sortOrder: currentSortOrder,
    searchTerm: searchState.search,
    enabled: overview !== null && overview.hasData && pagesTabActive,
  });

  const pagedKeywords: KeywordRow[] = keywordsQuery.data?.keywords ?? [];
  const totalKeywordCount =
    keywordsQuery.data?.totalCount ?? overview?.organicKeywords ?? null;

  const pagedPages: PageRow[] = pagesQuery.data?.pages ?? [];
  const totalPagesCount = pagesQuery.data?.totalCount ?? null;

  const dataState = useOverviewDataState({
    pagedKeywords,
    setSelectedKeywords,
    activeFilterCount: domainFilters.activeAppliedCount,
  });

  const handlers = useDomainControllerHandlers({
    controlsForm,
    currentSortOrder,
    currentState: searchState,
    dataState,
    projectId,
    saveMutation,
    selectedKeywords,
    setSearchParams,
  });

  const canSaveKeywords =
    controlsForm.state.values.locationCode === searchState.locationCode &&
    overview !== null &&
    overview.hasData;

  const goToPage = useCallback(
    (nextPage: number) => {
      const safe = Math.max(1, Math.floor(nextPage));
      setSearchParams({ page: safe === 1 ? undefined : safe });
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (nextSize: number) => {
      setSearchParams({
        size:
          nextSize === DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE ? undefined : nextSize,
        page: undefined,
      });
    },
    [setSearchParams],
  );

  // Treat the page as loading until the active tab's first fetch resolves —
  // otherwise the table area would render an empty shell with a spinner while
  // we wait on DataForSEO. `isLoading` is true only on the very first fetch
  // (subsequent paginations keep prior data via keepPreviousData).
  const activeTabFirstFetch =
    (keywordsTabActive && keywordsQuery.isLoading) ||
    (pagesTabActive && pagesQuery.isLoading);
  const isLoading = overviewQuery.isLoading || activeTabFirstFetch;

  return {
    controlsForm,
    isLoading,
    overview,
    canSaveKeywords,
    history,
    historyLoaded,
    removeHistoryItem,
    searchDraft: domainFilters.searchDraft,
    setSearchDraft: domainFilters.setSearchDraft,
    selectedKeywords,
    currentSortOrder,
    setSearchParams,
    showFilters,
    setShowFilters,
    filtersForm: domainFilters.filtersForm,
    resetFilters: domainFilters.resetFilters,
    applyFilters: domainFilters.applyFilters,
    cancelFilterEdits: domainFilters.cancelEdits,
    dirtyFilterCount: domainFilters.dirtyCount,
    conditionCount: domainFilters.conditionCount,
    overLimit: domainFilters.overLimit,
    keywordsLoading: keywordsQuery.isFetching,
    keywordsError: keywordsQuery.error,
    pagesLoading: pagesQuery.isFetching,
    pagesError: pagesQuery.error,
    page: searchState.page,
    pageSize: searchState.pageSize,
    totalKeywordCount,
    totalPagesCount,
    hasNextKeywordsPage: keywordsQuery.data?.hasMore ?? false,
    hasNextPagesPage: pagesQuery.data?.hasMore ?? false,
    pagedPages,
    goToPage,
    setPageSize,
    ...handlers,
    ...dataState,
  };
}
