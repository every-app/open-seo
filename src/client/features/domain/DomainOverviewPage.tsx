import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { DomainOverviewLoadingState } from "@/client/features/domain/components/DomainOverviewLoadingState";
import { DomainHistorySection } from "@/client/features/domain/components/DomainHistorySection";
import { DomainResultsCard } from "@/client/features/domain/components/DomainResultsCard";
import { DomainSearchCard } from "@/client/features/domain/components/DomainSearchCard";
import { StatCard } from "@/client/features/domain/components/StatCard";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import type { SearchTabInput } from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import { useDomainOverviewController } from "@/client/features/domain/useDomainOverviewController";
import {
  normalizeDomainTarget,
  formatMetric,
  getDefaultSortOrder,
  toSortOrderSearchParam,
} from "@/client/features/domain/utils";
import { createFormValidationErrors } from "@/client/lib/forms";
import type {
  DomainActiveTab,
  DomainFilterValues,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";

type Props = {
  projectId: string;
  searchState: {
    domain: string;
    subdomains: boolean;
    sort: DomainSortMode;
    order?: SortOrder;
    tab: DomainActiveTab;
    search: string;
    locationCode: number;
    page: number;
    pageSize: number;
    appliedFilters: DomainFilterValues;
  };
  navigate: (args: {
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace: boolean;
  }) => void;
  onShowRecentSearches: () => void;
};

export function DomainOverviewPage({
  projectId,
  searchState,
  navigate,
  onShowRecentSearches,
}: Props) {
  const queryClient = useQueryClient();
  const state = useDomainOverviewController({
    projectId,
    queryClient,
    navigate,
    searchState,
  });
  const urlTabInput = useMemo<SearchTabInput | null>(() => {
    if (searchState.domain.trim() === "") return null;
    return {
      type: "domain",
      domain: searchState.domain,
      subdomains: searchState.subdomains,
      sort: searchState.sort,
      order: searchState.order ?? getDefaultSortOrder(searchState.sort),
      locationCode: searchState.locationCode,
    };
  }, [
    searchState.domain,
    searchState.locationCode,
    searchState.order,
    searchState.sort,
    searchState.subdomains,
  ]);

  const navigateToTab = useCallback(
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
          domain: input.domain,
          subdomains: input.subdomains ? undefined : false,
          sort: input.sort === "rank" ? undefined : input.sort,
          order: toSortOrderSearchParam(input.sort, input.order),
          loc:
            input.locationCode === DEFAULT_LOCATION_CODE
              ? undefined
              : input.locationCode,
          page: undefined,
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
    getLabel: useCallback(
      (input) => (input.type === "domain" ? input.domain : ""),
      [],
    ),
    navigateToInput: navigateToTab,
  });
  const handleSearchSubmit = useCallback(
    (event: React.FormEvent) => {
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
        sort: values.sort,
        order: searchState.order ?? getDefaultSortOrder(values.sort),
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
    [searchState.order, searchTabs, state],
  );
  const tabControls = searchState.domain ? (
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
        activeTabId={searchTabs.activeTabId}
        tabs={searchTabs.tabs}
        onSelect={searchTabs.selectTab}
        onClose={searchTabs.closeTab}
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

            <DomainResultsCard
              projectId={projectId}
              overview={state.overview}
              activeTab={searchState.tab}
              sortMode={searchState.sort}
              currentSortOrder={state.currentSortOrder}
              searchDraft={state.searchDraft}
              selectedKeywords={state.selectedKeywords}
              setSelectedKeywords={state.setSelectedKeywords}
              visibleKeywords={state.visibleKeywords}
              filteredKeywords={state.filteredKeywords}
              pagedPages={state.pagedPages}
              showFilters={state.showFilters}
              setShowFilters={state.setShowFilters}
              filtersForm={state.filtersForm}
              activeFilterCount={state.activeFilterCount}
              dirtyFilterCount={state.dirtyFilterCount}
              conditionCount={state.conditionCount}
              overLimit={state.overLimit}
              resetFilters={state.resetFilters}
              applyFilters={state.applyFilters}
              cancelFilterEdits={state.cancelFilterEdits}
              onSearchChange={state.setSearchDraft}
              onSaveKeywords={state.handleSaveKeywords}
              canSaveKeywords={state.canSaveKeywords}
              onSortClick={state.handleSortColumnClick}
              onToggleKeyword={state.toggleKeywordSelection}
              page={state.page}
              pageSize={state.pageSize}
              totalKeywordCount={state.totalKeywordCount}
              totalPagesCount={state.totalPagesCount}
              hasNextKeywordsPage={state.hasNextKeywordsPage}
              hasNextPagesPage={state.hasNextPagesPage}
              isKeywordsLoading={state.keywordsLoading}
              isPagesLoading={state.pagesLoading}
              onPageChange={state.goToPage}
              onPageSizeChange={state.setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
