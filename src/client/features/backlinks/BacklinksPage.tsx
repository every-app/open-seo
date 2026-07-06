import { useCallback, useMemo } from "react";
import type { SortingState, Updater } from "@tanstack/react-table";
import { BacklinksSearchCard } from "./BacklinksSearchCard";
import { BacklinksBody } from "./BacklinksPageContent";
import type { BacklinksPageProps } from "./backlinksPageTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  navigateToBacklinksSearch,
  useBacklinksPageData,
} from "./useBacklinksPageData";
import { useBacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import { useBacklinksFilters } from "./useBacklinksFilters";
import { useBacklinksSearchHistory } from "@/client/hooks/useBacklinksSearchHistory";
import type {
  BacklinksSearchTabInput,
  SearchTabInput,
} from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import {
  BACKLINKS_DEFAULT_SORT,
  DEFAULT_BACKLINKS_PAGE_SIZE,
} from "@/types/schemas/backlinks";

export function BacklinksPage({
  projectId,
  searchState,
  navigate,
}: BacklinksPageProps) {
  const filters = useBacklinksFilters();

  // Sort lives in the URL so sort changes and the page reset commit in one
  // navigation (no transient fetch of the old page with the new sort).
  const sorting = useMemo<SortingState>(() => {
    const fallback = BACKLINKS_DEFAULT_SORT[searchState.tab];
    const field = searchState.sort ?? fallback.field;
    const order =
      searchState.order ?? (searchState.sort ? "desc" : fallback.order);
    return [{ id: field, desc: order === "desc" }];
  }, [searchState.order, searchState.sort, searchState.tab]);

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      navigate({
        search: (prev) => ({
          ...prev,
          sort: first?.id,
          order: first ? (first.desc ? "desc" : "asc") : undefined,
          page: undefined,
        }),
        replace: true,
      });
    },
    [navigate, sorting],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      navigate({
        search: (prev) => ({
          ...prev,
          page: nextPage === 1 ? undefined : nextPage,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => {
      navigate({
        search: (prev) => ({
          ...prev,
          size:
            nextPageSize === DEFAULT_BACKLINKS_PAGE_SIZE
              ? undefined
              : nextPageSize,
          page: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleViewChange = useCallback(
    (nextView: "all" | undefined) => {
      navigate({
        search: (prev) => ({ ...prev, view: nextView, page: undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  const domainExpansion = useBacklinksDomainExpansion({
    projectId,
    searchState,
  });

  const {
    activeTabErrorMessage,
    activeTabQuery,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    rowsQuery,
    searchCardInitialValues,
    topPagesQuery,
  } = useBacklinksPageData({
    projectId,
    searchState,
    filters,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useBacklinksSearchHistory(projectId);
  const urlTabInput = useMemo<SearchTabInput | null>(() => {
    if (searchState.target.trim() === "") return null;
    return {
      type: "backlinks",
      target: searchState.target,
      scope: searchState.scope,
    };
  }, [searchState.scope, searchState.target]);
  const navigateToTab = useCallback(
    (input: SearchTabInput | null) => {
      if (input?.type !== "backlinks") {
        navigate({
          search: () => ({}),
          replace: true,
        });
        return;
      }
      navigateToBacklinksSearch(navigate, {
        target: input.target,
        scope: input.scope,
      });
    },
    [navigate],
  );
  const handleResultTabChange = useCallback(
    (tab: BacklinksSearchState["tab"]) => {
      navigate({
        search: (prev) => ({
          ...prev,
          tab: tab === "backlinks" ? undefined : tab,
          page: undefined,
          sort: undefined,
          order: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );
  const searchTabs = useSearchTabNavigation({
    storageKey: `backlinks:${projectId}`,
    urlInput: urlTabInput,
    getLabel: useCallback(
      (input) => (input.type === "backlinks" ? input.target : ""),
      [],
    ),
    navigateToInput: navigateToTab,
  });
  const toBacklinksTabInput = useCallback(
    (
      values: Pick<BacklinksSearchState, "target" | "scope">,
    ): BacklinksSearchTabInput => ({
      type: "backlinks",
      target: values.target,
      scope: values.scope,
    }),
    [],
  );
  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Backlinks</h1>
          <p className="text-sm text-base-content/70">
            Understand who links to a site, what changed recently, and which
            pages attract links.
          </p>
        </div>

        <BacklinksSearchCard
          errorMessage={overviewErrorMessage}
          initialValues={searchCardInitialValues}
          canOpenSearch={(values) =>
            searchTabs.canOpenTab(toBacklinksTabInput(values))
          }
          tabLimit={searchTabs.limit}
          onSubmit={(values) => {
            searchTabs.openTab(toBacklinksTabInput(values));
            navigateToBacklinksSearch(navigate, values);
            addSearch({ target: values.target, scope: values.scope });
          }}
        />

        <BacklinksBody
          projectId={projectId}
          history={history}
          historyLoaded={historyLoaded}
          overviewData={overviewQuery.data}
          overviewError={overviewErrorMessage}
          overviewLoading={overviewQuery.isLoading}
          backlinksRowsPage={rowsQuery.data}
          referringDomainsPage={referringDomainsQuery.data}
          topPagesPage={topPagesQuery.data}
          searchState={searchState}
          filters={filters}
          sorting={sorting}
          domainExpansion={domainExpansion}
          tabErrorMessage={activeTabErrorMessage}
          tabLoading={activeTabQuery.isLoading}
          tabFetching={activeTabQuery.isFetching}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRemoveHistoryItem={removeHistoryItem}
          onRetryOverview={() => void overviewQuery.refetch()}
          onSortingChange={handleSortingChange}
          onTabChange={handleResultTabChange}
          onViewChange={handleViewChange}
          searchTabs={
            searchState.target
              ? {
                  activeTabId: searchTabs.activeTabId,
                  tabs: searchTabs.tabs,
                  onSelect: searchTabs.selectTab,
                  onClose: searchTabs.closeTab,
                  onViewed: searchTabs.markTabViewed,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
