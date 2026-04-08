import { useMemo } from "react";
import {
  BacklinksOverviewPanels,
  BacklinksResultsCard,
} from "./BacklinksPageSections";
import {
  BacklinksAccessLoadingState,
  BacklinksErrorState,
  BacklinksLoadingState,
  BacklinksSetupGate,
} from "./BacklinksPageStates";
import { BacklinksHistorySection } from "./BacklinksHistorySection";
import type { BacklinksSearchHistoryItem } from "@/client/hooks/useBacklinksSearchHistory";
import type {
  BacklinksAccessStatusData,
  BacklinksOverviewData,
  BacklinksReferringDomainsData,
  BacklinksSearchState,
  BacklinksTopPagesData,
} from "./backlinksPageTypes";
import { buildSummaryStats } from "./backlinksPageUtils";
import {
  filterBacklinkRows,
  filterReferringDomainRows,
  filterTopPageRows,
} from "./backlinksFiltering";
import type { BacklinksFiltersState } from "./useBacklinksFilters";

type BacklinksBodyProps = {
  accessStatus: BacklinksAccessStatusData | undefined;
  accessStatusError: string | null;
  backlinksDisabledByError: boolean;
  backlinksEnabled: boolean;
  history: BacklinksSearchHistoryItem[];
  historyLoaded: boolean;
  isAccessStatusLoading: boolean;
  overviewData: BacklinksOverviewData | undefined;
  overviewError: string | null;
  overviewLoading: boolean;
  referringDomains: BacklinksReferringDomainsData | undefined;
  searchState: BacklinksSearchState;
  filters: BacklinksFiltersState;
  tabErrorMessage: string | null;
  tabLoading: boolean;
  testError: string | null;
  testIsPending: boolean;
  topPages: BacklinksTopPagesData | undefined;
  onRemoveHistoryItem: (timestamp: number) => void;
  onRetryAccess: () => void;
  onSelectHistoryItem: (item: BacklinksSearchHistoryItem) => void;
  onShowHistory: () => void;
  onSetActiveTab: (tab: BacklinksSearchState["tab"]) => void;
  onRetryOverview: () => void;
  onTestAccess: () => void;
};

export function BacklinksBody({
  accessStatus,
  accessStatusError,
  backlinksDisabledByError,
  backlinksEnabled,
  history,
  historyLoaded,
  isAccessStatusLoading,
  overviewData,
  overviewError,
  overviewLoading,
  referringDomains,
  searchState,
  filters,
  tabErrorMessage,
  tabLoading,
  testError,
  testIsPending,
  topPages,
  onRemoveHistoryItem,
  onRetryAccess,
  onSelectHistoryItem,
  onShowHistory,
  onSetActiveTab,
  onRetryOverview,
  onTestAccess,
}: BacklinksBodyProps) {
  const mergedData = useMemo(
    () => mergeTabData(overviewData, referringDomains, topPages),
    [overviewData, referringDomains, topPages],
  );
  const filteredData = useMemo(() => {
    if (!mergedData) {
      return { backlinks: [], referringDomains: [], topPages: [] };
    }
    return {
      backlinks: filterBacklinkRows(
        mergedData.backlinks,
        filters.backlinks.values,
      ),
      referringDomains: filterReferringDomainRows(
        mergedData.referringDomains,
        filters.domains.values,
      ),
      topPages: filterTopPageRows(mergedData.topPages, filters.pages.values),
    };
  }, [
    mergedData,
    filters.backlinks.values,
    filters.domains.values,
    filters.pages.values,
  ]);
  const summaryStats = useMemo(
    () => buildSummaryStats(mergedData),
    [mergedData],
  );

  if (isAccessStatusLoading) {
    return <BacklinksAccessLoadingState />;
  }

  if (accessStatusError) {
    return (
      <BacklinksErrorState
        errorMessage={accessStatusError}
        onRetry={onRetryAccess}
      />
    );
  }

  if (!backlinksEnabled || backlinksDisabledByError) {
    return (
      <BacklinksSetupGate
        status={accessStatus}
        isTesting={testIsPending}
        testError={testError}
        onTest={onTestAccess}
      />
    );
  }

  if (!searchState.target) {
    return (
      <BacklinksHistorySection
        history={history}
        historyLoaded={historyLoaded}
        onRemoveHistoryItem={onRemoveHistoryItem}
        onSelectHistoryItem={onSelectHistoryItem}
      />
    );
  }

  if (overviewLoading) {
    return <BacklinksLoadingState />;
  }

  if (!mergedData) {
    return (
      <BacklinksErrorState
        errorMessage={overviewError}
        onRetry={onRetryOverview}
      />
    );
  }

  return (
    <>
      <BacklinksOverviewPanels
        data={mergedData}
        onShowHistory={onShowHistory}
        summaryStats={summaryStats}
      />
      <BacklinksResultsCard
        activeTab={searchState.tab}
        filteredData={filteredData}
        filters={filters}
        isTabLoading={searchState.tab !== "backlinks" && tabLoading}
        tabErrorMessage={
          searchState.tab !== "backlinks" ? tabErrorMessage : null
        }
        onSetActiveTab={onSetActiveTab}
        exportTarget={mergedData.displayTarget || searchState.target}
      />
    </>
  );
}

function mergeTabData(
  data: BacklinksOverviewData | undefined,
  referringDomains: BacklinksReferringDomainsData | undefined,
  topPages: BacklinksTopPagesData | undefined,
) {
  if (!data) {
    return undefined;
  }

  return {
    ...data,
    referringDomains: referringDomains ?? data.referringDomains,
    topPages: topPages ?? data.topPages,
  };
}
