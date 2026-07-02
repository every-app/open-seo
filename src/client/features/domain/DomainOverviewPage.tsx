/* eslint-disable max-lines, max-lines-per-function -- Domain Overview keeps page-only orchestration colocated to avoid fake indirection. */
import { useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  type DomainSearchParams,
} from "@/types/schemas/domain";
import {
  DEFAULT_LOCATION_CODE,
  LOCATIONS,
  getLanguageCode,
  isLabsLocationCode,
} from "@/client/features/keywords/locations";
import { useDomainSearchHistory } from "@/client/hooks/useDomainSearchHistory";
import type { DomainSearchHistoryItem } from "@/client/hooks/useDomainSearchHistory";
import {
  getDomainSearchChangeValidationErrors,
  getDomainSearchValidationErrors,
} from "@/client/features/domain/domainSearchValidation";
import { useDomainOverviewQuery } from "@/client/features/domain/hooks/useDomainOverviewQuery";
import { DomainOverviewLoadingState } from "@/client/features/domain/components/DomainOverviewLoadingState";
import { DomainHistorySection } from "@/client/features/domain/components/DomainHistorySection";
import { DomainSearchCard } from "@/client/features/domain/components/DomainSearchCard";
import { KeywordsTab } from "@/client/features/domain/components/KeywordsTab";
import { PagesTab } from "@/client/features/domain/components/PagesTab";
import { StatCard } from "@/client/features/domain/components/StatCard";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import type { SearchTabInput } from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import {
  formatMetric,
  getDefaultSortOrder,
  normalizeDomainTarget,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import { buildDomainFiltersClearSearchUpdate } from "@/client/features/domain/domainFilterUtils";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import type { DomainOverviewRouteState } from "@/client/features/domain/domainRouteState";
import type {
  DomainActiveTab,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  projectId: string;
  routeState: DomainOverviewRouteState;
  navigate: (args: {
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace: boolean;
  }) => void;
  onShowRecentSearches: () => void;
};

type DomainNavigate = Props["navigate"];
type DomainSearchUpdate = Partial<DomainSearchParams>;

const KEYWORDS_ONLY_SORTS: ReadonlySet<DomainSortMode> = new Set([
  "rank",
  "score",
  "cpc",
]);

function getSortSearchUpdate(
  nextSort: DomainSortMode,
  nextOrder: SortOrder,
): DomainSearchUpdate {
  return {
    sort: toSortSearchParam(nextSort),
    order: toSortOrderSearchParam(nextSort, nextOrder),
    page: undefined,
  };
}

function getLocationSearchUpdate(nextLocationCode: number): DomainSearchUpdate {
  return {
    loc:
      nextLocationCode === DEFAULT_LOCATION_CODE ? undefined : nextLocationCode,
    page: undefined,
  };
}

function getPageSearchUpdate(nextPage: number): DomainSearchUpdate {
  const safe = Math.max(1, Math.floor(nextPage));
  return { page: safe === 1 ? undefined : safe };
}

function getPageSizeSearchUpdate(nextSize: number): DomainSearchUpdate {
  return {
    size: nextSize === DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE ? undefined : nextSize,
    page: undefined,
  };
}

function getTabSearchUpdate(
  nextTab: DomainActiveTab,
  currentSort: DomainSortMode,
): DomainSearchUpdate {
  if (nextTab === "keywords") {
    return { tab: undefined, page: undefined };
  }

  const fallbackSortNeeded = KEYWORDS_ONLY_SORTS.has(currentSort);
  const update: DomainSearchUpdate = {
    tab: "pages",
    page: undefined,
  };
  if (fallbackSortNeeded) {
    update.sort = "traffic";
    update.order = getDefaultSortOrder("traffic");
  }
  return update;
}

function getHistorySearchUpdate(
  item: DomainSearchHistoryItem,
): DomainSearchUpdate {
  const historyLocation =
    item.locationCode != null && isLabsLocationCode(item.locationCode)
      ? item.locationCode
      : DEFAULT_LOCATION_CODE;

  return {
    ...buildDomainFiltersClearSearchUpdate(),
    domain: item.domain,
    subdomains: item.subdomains ? undefined : false,
    sort: toSortSearchParam(item.sort),
    order: undefined,
    tab: item.tab === "keywords" ? undefined : item.tab,
    loc:
      historyLocation === DEFAULT_LOCATION_CODE ? undefined : historyLocation,
    size: undefined,
  };
}

function getSearchSubmitUpdate({
  domain,
  subdomains,
  sort,
  locationCode,
  currentOrder,
  activeTab,
}: {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  locationCode: number;
  currentOrder: SortOrder;
  activeTab: DomainActiveTab;
}): DomainSearchUpdate {
  return {
    ...buildDomainFiltersClearSearchUpdate(),
    domain,
    subdomains: subdomains ? undefined : false,
    sort: toSortSearchParam(sort),
    order: toSortOrderSearchParam(sort, currentOrder),
    tab: activeTab === "keywords" ? undefined : activeTab,
    loc: locationCode === DEFAULT_LOCATION_CODE ? undefined : locationCode,
    size: undefined,
  };
}

function useDomainOverviewState({
  navigate,
  routeState,
  projectId,
}: {
  navigate: DomainNavigate;
  routeState: DomainOverviewRouteState;
  projectId: string;
}) {
  const lastTrackedKey = useRef<string>("");

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useDomainSearchHistory(projectId);

  const setSearchParams = useCallback(
    (updates: DomainSearchUpdate) => {
      navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const applySort = useCallback(
    (nextSort: DomainSortMode, nextOrder: SortOrder) => {
      setSearchParams(getSortSearchUpdate(nextSort, nextOrder));
    },
    [setSearchParams],
  );

  const applyLocationChange = useCallback(
    (nextLocationCode: number) => {
      setSearchParams(getLocationSearchUpdate(nextLocationCode));
    },
    [setSearchParams],
  );

  const handleSortColumnClick = useCallback(
    (nextSort: DomainSortMode) => {
      const nextOrder =
        nextSort === routeState.sort
          ? routeState.order === "asc"
            ? "desc"
            : "asc"
          : getDefaultSortOrder(nextSort);
      applySort(nextSort, nextOrder);
    },
    [applySort, routeState.order, routeState.sort],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      setSearchParams(getPageSearchUpdate(nextPage));
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (nextSize: number) => {
      setSearchParams(getPageSizeSearchUpdate(nextSize));
    },
    [setSearchParams],
  );

  const handleTabChange = useCallback(
    (nextTab: DomainActiveTab) => {
      setSearchParams(getTabSearchUpdate(nextTab, routeState.sort));
    },
    [routeState.sort, setSearchParams],
  );

  const handleHistorySelect = useCallback(
    (item: DomainSearchHistoryItem) => {
      setSearchParams(getHistorySearchUpdate(item));
    },
    [setSearchParams],
  );

  const languageCode = getLanguageCode(routeState.locationCode);
  const overviewQuery = useDomainOverviewQuery({
    projectId,
    domain: routeState.domain,
    includeSubdomains: routeState.subdomains,
    locationCode: routeState.locationCode,
    languageCode,
  });
  const overview = overviewQuery.data ?? null;
  const isLoading = overviewQuery.isLoading;

  const controlsForm = useForm({
    defaultValues: {
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      sort: routeState.sort,
      locationCode: routeState.locationCode,
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
      setSearchParams(
        getSearchSubmitUpdate({
          domain: target,
          subdomains: value.subdomains,
          sort: value.sort,
          locationCode: value.locationCode,
          currentOrder: routeState.order,
          activeTab: routeState.tab,
        }),
      );
    },
  });

  useEffect(() => {
    controlsForm.reset({
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      sort: routeState.sort,
      locationCode: routeState.locationCode,
    });
  }, [
    controlsForm,
    routeState.domain,
    routeState.locationCode,
    routeState.sort,
    routeState.subdomains,
  ]);

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

  useEffect(() => {
    if (!overviewQuery.isSuccess || !overview) return;
    const key = `${routeState.domain}|${routeState.subdomains}|${routeState.locationCode}`;
    if (lastTrackedKey.current === key) return;
    lastTrackedKey.current = key;

    captureClientEvent("domain_overview:search_complete", {
      sort_mode: routeState.sort,
      include_subdomains: routeState.subdomains,
      result_count: overview.organicKeywords ?? 0,
      location_code: routeState.locationCode,
    });
    addSearch({
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      sort: routeState.sort,
      tab: routeState.tab,
      locationCode: routeState.locationCode,
    });
    if (!overview.hasData) {
      toast.info("Not enough data for this domain");
    }
  }, [
    addSearch,
    overview,
    overviewQuery.isSuccess,
    routeState.domain,
    routeState.locationCode,
    routeState.sort,
    routeState.subdomains,
    routeState.tab,
  ]);

  useEffect(() => {
    if (routeState.domain.trim() !== "") return;
    lastTrackedKey.current = "";
  }, [routeState.domain]);

  const controlsLocationCode = useStore(
    controlsForm.store,
    (s) => s.values.locationCode,
  );
  const canSaveKeywords = useMemo(
    () =>
      controlsLocationCode === routeState.locationCode &&
      overview !== null &&
      overview.hasData,
    [controlsLocationCode, overview, routeState.locationCode],
  );

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void controlsForm.handleSubmit();
    },
    [controlsForm],
  );

  return {
    controlsForm,
    isLoading,
    overview,
    canSaveKeywords,
    history,
    historyLoaded,
    removeHistoryItem,
    languageCode,
    setSearchParams,
    applySort,
    applyLocationChange,
    handleTabChange,
    handleSortColumnClick,
    handleHistorySelect,
    handleSearchSubmit,
    goToPage,
    setPageSize,
  };
}

export type DomainOverviewControlsForm = ReturnType<
  typeof useDomainOverviewState
>["controlsForm"];

export function DomainOverviewPage({
  projectId,
  routeState,
  navigate,
  onShowRecentSearches,
}: Props) {
  const state = useDomainOverviewState({ navigate, routeState, projectId });
  const urlTabInput = useMemo<SearchTabInput | null>(() => {
    if (routeState.domain.trim() === "") return null;
    return {
      type: "domain",
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      locationCode: routeState.locationCode,
    };
  }, [routeState.domain, routeState.locationCode, routeState.subdomains]);

  const navigateToSearchTab = useCallback(
    (input: SearchTabInput | null) => {
      if (input?.type !== "domain") {
        navigate({
          search: () => ({}),
          replace: true,
        });
        return;
      }

      navigate({
        search: (prev) => ({
          ...prev,
          ...buildDomainFiltersClearSearchUpdate(),
          domain: input.domain,
          subdomains: input.subdomains ? undefined : false,
          sort: undefined,
          order: undefined,
          tab: undefined,
          page: undefined,
          loc:
            input.locationCode === DEFAULT_LOCATION_CODE
              ? undefined
              : input.locationCode,
          size: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const searchTabs = useSearchTabNavigation({
    storageKey: `domain:${projectId}`,
    urlInput: urlTabInput,
    getLabel: useCallback((input) => {
      if (input.type !== "domain") return "";
      const locationSuffix =
        input.locationCode === DEFAULT_LOCATION_CODE
          ? ""
          : ` ${LOCATIONS[input.locationCode] ?? input.locationCode}`;
      return `${input.domain}${locationSuffix}`;
    }, []),
    navigateToInput: navigateToSearchTab,
  });

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      const values = state.controlsForm.state.values;
      const target = normalizeDomainTarget(values.domain);
      if (!target) {
        state.handleSearchSubmit(event);
        return;
      }

      const nextTabInput: SearchTabInput = {
        type: "domain",
        domain: target,
        subdomains: values.subdomains,
        locationCode: values.locationCode,
      };

      if (!searchTabs.canOpenTab(nextTabInput)) {
        event.preventDefault();
        state.controlsForm.setErrorMap({
          onSubmit: createFormValidationErrors({
            fields: {
              domain: `Close a tab to open more searches (max ${searchTabs.limit}).`,
            },
          }),
        });
        return;
      }

      state.handleSearchSubmit(event);
    },
    [searchTabs, state],
  );

  const tabControls = routeState.domain ? (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
          onClick={() => {
            searchTabs.setActiveTab(null);
            onShowRecentSearches();
          }}
        >
          <ArrowLeft className="size-4" />
          Recent searches
        </button>
      </div>
      <SearchTabStrip
        projectId={projectId}
        activeTabId={searchTabs.activeTabId}
        tabs={searchTabs.tabs}
        onSelect={searchTabs.selectTab}
        onClose={searchTabs.closeTab}
        onViewed={searchTabs.markTabViewed}
      />
    </div>
  ) : null;

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Domain Overview</h1>
          <p className="text-sm text-base-content/70">
            Analyze any domain&apos;s SEO profile: traffic, keywords, and
            backlinks.
          </p>
        </div>

        <DomainSearchCard
          controlsForm={state.controlsForm}
          isLoading={state.isLoading}
          onSubmit={handleSearchSubmit}
          onSortChange={(sort) =>
            state.applySort(sort, getDefaultSortOrder(sort))
          }
          onLocationChange={(locationCode) =>
            state.applyLocationChange(locationCode)
          }
        />

        {state.isLoading ? (
          <>
            {tabControls}
            <DomainOverviewLoadingState />
          </>
        ) : state.overview === null ? (
          <div className="space-y-4 pt-1">
            <DomainHistorySection
              history={state.history}
              historyLoaded={state.historyLoaded}
              onRemoveHistoryItem={state.removeHistoryItem}
              onSelectHistoryItem={state.handleHistorySelect}
            />
          </div>
        ) : (
          <>
            {tabControls}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard
                label="Estimated Organic Traffic"
                value={formatMetric(
                  state.overview.organicTraffic,
                  state.overview.hasData,
                )}
              />
              <StatCard
                label="Organic Keywords"
                value={formatMetric(
                  state.overview.organicKeywords,
                  state.overview.hasData,
                )}
              />
            </div>

            {!state.overview.hasData ? (
              <div className="alert alert-info">
                <span>
                  Not enough data for this domain yet. Try another domain or
                  include subdomains.
                </span>
              </div>
            ) : null}

            <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
                <div role="tablist" className="tabs tabs-border w-fit">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={routeState.tab === "keywords"}
                    className={`tab ${routeState.tab === "keywords" ? "tab-active" : ""}`}
                    onClick={() => state.handleTabChange("keywords")}
                  >
                    Top Keywords
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={routeState.tab === "pages"}
                    className={`tab ${routeState.tab === "pages" ? "tab-active" : ""}`}
                    onClick={() => state.handleTabChange("pages")}
                  >
                    Top Pages
                  </button>
                </div>
              </div>

              {routeState.tab === "keywords" ? (
                <KeywordsTab
                  key="keywords"
                  projectId={projectId}
                  domain={state.overview.domain}
                  languageCode={state.languageCode}
                  routeState={routeState}
                  canSaveKeywords={state.canSaveKeywords}
                  setSearchParams={state.setSearchParams}
                  onSortClick={state.handleSortColumnClick}
                  onPageChange={state.goToPage}
                  onPageSizeChange={state.setPageSize}
                />
              ) : (
                <PagesTab
                  key="pages"
                  projectId={projectId}
                  domain={state.overview.domain}
                  languageCode={state.languageCode}
                  routeState={routeState}
                  setSearchParams={state.setSearchParams}
                  onSortClick={state.handleSortColumnClick}
                  onPageChange={state.goToPage}
                  onPageSizeChange={state.setPageSize}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
