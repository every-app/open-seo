import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { DomainOverviewLoadingState } from "@/client/features/domain/components/DomainOverviewLoadingState";
import { DomainHistorySection } from "@/client/features/domain/components/DomainHistorySection";
import { DomainResultsCard } from "@/client/features/domain/components/DomainResultsCard";
import { DomainSearchCard } from "@/client/features/domain/components/DomainSearchCard";
import { StatCard } from "@/client/features/domain/components/StatCard";
import { useDomainOverviewController } from "@/client/features/domain/useDomainOverviewController";
import {
  formatMetric,
  getDefaultSortOrder,
} from "@/client/features/domain/utils";
import type {
  DomainActiveTab,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  projectId: string;
  searchState: {
    domain: string;
    subdomains: boolean;
    sort: DomainSortMode;
    order?: SortOrder;
    tab: DomainActiveTab;
    search: string;
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
  const handleShowRecentSearches = () => {
    state.resetView();
    onShowRecentSearches();
  };

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
          onSubmit={state.handleSearchSubmit}
          onSortChange={(sort) =>
            state.applySort(sort, getDefaultSortOrder(sort))
          }
        />

        {state.isLoading ? (
          <DomainOverviewLoadingState />
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
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
                onClick={handleShowRecentSearches}
              >
                <ArrowLeft className="size-4" />
                Recent searches
              </button>
            </div>
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
              overview={state.overview}
              activeTab={searchState.tab}
              sortMode={searchState.sort}
              currentSortOrder={state.currentSortOrder}
              pendingSearch={state.pendingSearch}
              selectedKeywords={state.selectedKeywords}
              visibleKeywords={state.visibleKeywords}
              filteredKeywords={state.filteredKeywords}
              filteredPages={state.filteredPages}
              showFilters={state.showFilters}
              setShowFilters={state.setShowFilters}
              filtersForm={state.filtersForm}
              activeFilterCount={state.activeFilterCount}
              resetFilters={state.resetFilters}
              onTabChange={(tab) => {
                if (
                  tab === "pages" &&
                  (searchState.sort === "rank" ||
                    searchState.sort === "score" ||
                    searchState.sort === "cpc")
                ) {
                  state.applySort("traffic", getDefaultSortOrder("traffic"));
                }
                state.setSearchParams({ tab });
              }}
              onSearchChange={state.setPendingSearch}
              onSaveKeywords={state.handleSaveKeywords}
              onSortClick={state.handleSortColumnClick}
              onToggleKeyword={state.toggleKeywordSelection}
              onToggleAllVisible={state.toggleAllVisibleKeywords}
            />
          </>
        )}
      </div>
    </div>
  );
}
