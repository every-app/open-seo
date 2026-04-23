import { BacklinksSearchCard } from "./BacklinksSearchCard";
import { BacklinksBody } from "./BacklinksPageContent";
import type { BacklinksPageProps } from "./backlinksPageTypes";
import {
  navigateToBacklinksHistory,
  navigateToBacklinksSearch,
  navigateToBacklinksTab,
  useBacklinksPageData,
} from "./useBacklinksPageData";
import { useBacklinksFilters } from "./useBacklinksFilters";
import { useBacklinksSearchHistory } from "@/client/hooks/useBacklinksSearchHistory";

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

  const handleHistorySelect = (item: {
    target: string;
    scope: "domain" | "page";
  }) => {
    navigateToBacklinksSearch(navigate, {
      target: item.target,
      scope: item.scope,
    });
  };

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
            isFetching={
              overviewQuery.isFetching ||
              referringDomainsQuery.isFetching ||
              topPagesQuery.isFetching
            }
            onSubmit={(values) => {
              navigateToBacklinksSearch(navigate, values);
              addSearch({ target: values.target, scope: values.scope });
            }}
          />
        ) : null}

        <BacklinksBody
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
          onSelectHistoryItem={handleHistorySelect}
          onShowHistory={() => navigateToBacklinksHistory(navigate)}
          onSetActiveTab={(tab) => navigateToBacklinksTab(navigate, tab)}
          onRetryOverview={() => void overviewQuery.refetch()}
        />
      </div>
    </div>
  );
}
