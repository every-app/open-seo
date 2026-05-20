import { useCallback, useMemo } from "react";
import { BacklinksSearchCard } from "./BacklinksSearchCard";
import { BacklinksBody } from "./BacklinksPageContent";
import type { BacklinksPageProps } from "./backlinksPageTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  navigateToBacklinksSearch,
  useBacklinksPageData,
} from "./useBacklinksPageData";
import { useBacklinksFilters } from "./useBacklinksFilters";
import { useBacklinksSearchHistory } from "@/client/hooks/useBacklinksSearchHistory";
import type {
  BacklinksSearchTabInput,
  SearchTabInput,
} from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";

export function BacklinksPage({
  projectId,
  searchState,
  navigate,
}: BacklinksPageProps) {
  const filters = useBacklinksFilters();
  const {
    accessGate,
    activeTabErrorMessage,
    backlinksDisabledByError,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    searchCardInitialValues,
    topPagesQuery,
  } = useBacklinksPageData({
    projectId,
    searchState,
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

        {!accessGate.isLoading &&
        accessGate.enabled &&
        !backlinksDisabledByError ? (
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
        ) : null}

        <BacklinksBody
          projectId={projectId}
          accessGate={accessGate}
          backlinksDisabledByError={backlinksDisabledByError}
          history={history}
          historyLoaded={historyLoaded}
          overviewData={overviewQuery.data}
          overviewError={overviewErrorMessage}
          overviewLoading={overviewQuery.isLoading}
          referringDomains={referringDomainsQuery.data}
          searchState={searchState}
          filters={filters}
          tabErrorMessage={activeTabErrorMessage}
          tabLoading={
            (searchState.tab === "domains" &&
              referringDomainsQuery.isLoading) ||
            (searchState.tab === "pages" && topPagesQuery.isLoading)
          }
          topPages={topPagesQuery.data}
          onRemoveHistoryItem={removeHistoryItem}
          onRetryOverview={() => void overviewQuery.refetch()}
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
