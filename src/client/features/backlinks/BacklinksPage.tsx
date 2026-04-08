import { BacklinksSearchCard } from "./BacklinksSearchCard";
import { BacklinksBody } from "./BacklinksPageContent";
import type { BacklinksPageProps } from "./backlinksPageTypes";
import {
  navigateToBacklinksHistory,
  navigateToBacklinksSearch,
  navigateToBacklinksTab,
  useBacklinksPageData,
} from "./useBacklinksPageData";
import { useBacklinksSearchHistory } from "@/client/hooks/useBacklinksSearchHistory";
import { useBacklinksSpamPreferences } from "./useBacklinksSpamPreferences";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function BacklinksPage({
  projectId,
  searchState,
  navigate,
}: BacklinksPageProps) {
  const { hideSpam, setHideSpam, setSpamThreshold, spamThreshold } =
    useBacklinksSpamPreferences();
  const {
    accessStatus,
    accessStatusErrorMessage,
    accessStatusQuery,
    activeTabErrorMessage,
    backlinksDisabledByError,
    backlinksEnabled,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    searchCardInitialValues,
    testAccessMutation,
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

        {!accessStatusQuery.isLoading &&
        backlinksEnabled &&
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
          accessStatus={accessStatus}
          accessStatusError={accessStatusErrorMessage}
          backlinksDisabledByError={backlinksDisabledByError}
          backlinksEnabled={backlinksEnabled}
          history={history}
          historyLoaded={historyLoaded}
          isAccessStatusLoading={accessStatusQuery.isLoading}
          overviewData={overviewQuery.data}
          overviewError={overviewErrorMessage}
          overviewLoading={overviewQuery.isLoading}
          referringDomains={referringDomainsQuery.data}
          searchState={searchState}
          tabErrorMessage={activeTabErrorMessage}
          tabLoading={
            (searchState.tab === "domains" &&
              referringDomainsQuery.isLoading) ||
            (searchState.tab === "pages" && topPagesQuery.isLoading)
          }
          testError={
            testAccessMutation.error
              ? getStandardErrorMessage(
                  testAccessMutation.error,
                  "Could not test Backlinks access.",
                )
              : null
          }
          testIsPending={testAccessMutation.isPending}
          topPages={topPagesQuery.data}
          hideSpam={hideSpam}
          spamThreshold={spamThreshold}
          onRemoveHistoryItem={removeHistoryItem}
          onRetryAccess={() => void accessStatusQuery.refetch()}
          onSelectHistoryItem={handleHistorySelect}
          onShowHistory={() => navigateToBacklinksHistory(navigate)}
          onSetActiveTab={(tab) => navigateToBacklinksTab(navigate, tab)}
          onRetryOverview={() => void overviewQuery.refetch()}
          onTestAccess={() => testAccessMutation.mutate()}
          onSetHideSpam={setHideSpam}
          onSetSpamThreshold={setSpamThreshold}
        />
      </div>
    </div>
  );
}
