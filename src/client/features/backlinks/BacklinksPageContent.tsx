import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import {
  BacklinksOverviewPanels,
  BacklinksScopeAlert,
} from "./BacklinksOverviewPanels";
import { BacklinksResultsCard } from "./BacklinksPageSections";
import { BacklinksLoadingState } from "./BacklinksPageStates";
import type { BacklinksSearchHistoryItem } from "@/client/hooks/useBacklinksSearchHistory";
import type {
  BacklinksSearchState,
  BacklinksTabRows,
} from "./backlinksPageTypes";
import { buildSummaryStats } from "./backlinksPageUtils";
import type { BacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import type { BacklinksPageData } from "./useBacklinksPageData";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import { QueryError } from "@/client/components/QueryState";
import { Card } from "@/client/components/ui/card";
import { RecentSearches } from "@/client/components/RecentSearches";
import {
  RESEARCH_SCOPE_LABELS,
  toScopeSearchParam,
} from "@/shared/researchScope";
import type { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";

type BacklinksBodyProps = {
  projectId: string;
  history: BacklinksSearchHistoryItem[];
  historyLoaded: boolean;
  data: BacklinksPageData;
  searchState: BacklinksSearchState;
  filters: BacklinksFiltersState;
  sorting: SortingState;
  domainExpansion: BacklinksDomainExpansion;
  searchTabs: ReturnType<typeof useSearchTabNavigation>;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSortingChange: OnChangeFn<SortingState>;
  onTabChange: (tab: BacklinksSearchState["tab"]) => void;
  onViewChange: (view: "all" | undefined) => void;
  onHideSpamChange: (hideSpam: boolean) => void;
};

export function BacklinksBody({
  projectId,
  history,
  historyLoaded,
  data,
  searchState,
  filters,
  sorting,
  domainExpansion,
  searchTabs,
  onPageChange,
  onPageSizeChange,
  onRemoveHistoryItem,
  onSortingChange,
  onTabChange,
  onViewChange,
  onHideSpamChange,
}: BacklinksBodyProps) {
  const overviewData = data.overviewQuery.data;
  const backlinksRowsPage = data.rowsQuery.data;
  const referringDomainsPage = data.referringDomainsQuery.data;
  const topPagesPage = data.topPagesQuery.data;
  const tabRows = useMemo<BacklinksTabRows>(
    () => ({
      backlinks: backlinksRowsPage?.rows ?? [],
      referringDomains: referringDomainsPage?.rows ?? [],
      topPages: topPagesPage?.rows ?? [],
    }),
    [backlinksRowsPage, referringDomainsPage, topPagesPage],
  );
  const activeTabPage = data.activeTabQuery.data;
  const summaryStats = useMemo(
    () => buildSummaryStats(overviewData),
    [overviewData],
  );
  const tabControls = (
    <SearchTabStrip
      projectId={projectId}
      activeTabId={searchTabs.activeTabId}
      tabs={searchTabs.tabs}
      onSelect={searchTabs.selectTab}
      onClose={searchTabs.closeTab}
      onViewed={searchTabs.markTabViewed}
    />
  );

  if (!searchState.target) {
    return (
      <RecentSearches
        items={history}
        loaded={historyLoaded}
        onRemove={onRemoveHistoryItem}
        emptyIcon={Link2}
        emptyTitle="Enter a domain or URL to get started"
        getTitle={(item) => item.target}
        getSubtitle={(item) => RESEARCH_SCOPE_LABELS[item.scope]}
        renderLink={(item, props) => (
          <Link
            from="/p/$projectId/backlinks"
            to="/p/$projectId/backlinks"
            params={{ projectId }}
            search={(prev) => ({
              ...prev,
              target: item.target,
              scope: toScopeSearchParam(item.target, item.scope),
              tab: undefined,
              page: undefined,
              sort: undefined,
              order: undefined,
            })}
            replace
            {...props}
          />
        )}
      />
    );
  }

  // isPending (not isLoading) also covers a fetch paused while offline, which
  // would otherwise fall through to the error card with no error.
  if (data.overviewQuery.isPending) {
    return (
      <>
        {tabControls}
        <BacklinksLoadingState />
      </>
    );
  }

  if (!overviewData) {
    return (
      <>
        {tabControls}
        <QueryError
          title="Could not load backlinks"
          cause={data.overviewQuery.error}
          fallback={
            data.overviewErrorMessage ?? "Please try again in a moment."
          }
          onRetry={() => void data.overviewQuery.refetch()}
          isRetrying={data.overviewQuery.isFetching}
        />
      </>
    );
  }

  return (
    <>
      {tabControls}
      <BacklinksScopeAlert scope={overviewData.scope} />
      <Card className="gap-0 py-0">
        <BacklinksOverviewPanels
          data={overviewData}
          summaryStats={summaryStats}
        />
        <div className="px-4 pb-4">
          <BacklinksResultsCard
            projectId={projectId}
            activeTab={searchState.tab}
            scope={searchState.scope}
            tabRows={tabRows}
            filters={filters}
            sorting={sorting}
            view={searchState.view}
            hideSpam={!searchState.includeSpam}
            onHideSpamChange={onHideSpamChange}
            domainExpansion={domainExpansion}
            isTabLoading={
              data.activeTabQuery.isPending && !data.activeTabFilterError
            }
            // A failed refetch keeps the loaded rows; a filter budget error hides
            // them because the query never ran for the current filters.
            showTable={
              activeTabPage !== undefined && !data.activeTabFilterError
            }
            tabErrorMessage={data.activeTabErrorMessage}
            tabError={
              data.activeTabFilterError ? undefined : data.activeTabQuery.error
            }
            onRetryTab={
              data.activeTabFilterError
                ? undefined
                : () => void data.activeTabQuery.refetch()
            }
            isTabRetrying={data.activeTabQuery.isFetching}
            exportTarget={overviewData.displayTarget || searchState.target}
            pagination={{
              page: searchState.page,
              pageSize: searchState.pageSize,
              totalCount: activeTabPage?.totalCount ?? null,
              hasNextPage: activeTabPage?.hasMore ?? false,
              isFetching: data.activeTabQuery.isFetching,
            }}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            onSortingChange={onSortingChange}
            onTabChange={onTabChange}
            onViewChange={onViewChange}
          />
        </div>
      </Card>
    </>
  );
}
