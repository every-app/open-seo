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
  BacklinksOverviewData,
  BacklinksReferringDomainsData,
  BacklinksSearchState,
  BacklinksTopPagesData,
} from "./backlinksPageTypes";
import type { UseAccessGateResult } from "@/client/features/access-gate/useAccessGate";
import { buildSummaryStats } from "./backlinksPageUtils";
import {
  filterBacklinkRows,
  filterReferringDomainRows,
  filterTopPageRows,
} from "./backlinksFiltering";
import type { BacklinksFiltersState } from "./useBacklinksFilters";

type BacklinksBodyProps = {
  accessGate: UseAccessGateResult;
  backlinksDisabledByError: boolean;
  history: BacklinksSearchHistoryItem[];
  historyLoaded: boolean;
  overviewData: BacklinksOverviewData | undefined;
  overviewError: string | null;
  overviewLoading: boolean;
  referringDomains: BacklinksReferringDomainsData | undefined;
  searchState: BacklinksSearchState;
  filters: BacklinksFiltersState;
  tabErrorMessage: string | null;
  tabLoading: boolean;
  topPages: BacklinksTopPagesData | undefined;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSelectHistoryItem: (item: BacklinksSearchHistoryItem) => void;
  onShowHistory: () => void;
  onSetActiveTab: (tab: BacklinksSearchState["tab"]) => void;
  onRetryOverview: () => void;
};

export function BacklinksBody({
  accessGate,
  backlinksDisabledByError,
  history,
  historyLoaded,
  overviewData,
  overviewError,
  overviewLoading,
  referringDomains,
  searchState,
  filters,
  tabErrorMessage,
  tabLoading,
  topPages,
  onRemoveHistoryItem,
  onSelectHistoryItem,
  onShowHistory,
  onSetActiveTab,
  onRetryOverview,
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

  if (accessGate.isLoading) {
    return <BacklinksAccessLoadingState />;
  }

  if (accessGate.statusErrorMessage) {
    return (
      <BacklinksErrorState
        errorMessage={accessGate.statusErrorMessage}
        onRetry={accessGate.onRetry}
      />
    );
  }

  if (!accessGate.enabled || backlinksDisabledByError) {
    return (
      <BacklinksSetupGate
        errorMessage={accessGate.errorMessage}
        isRefetching={accessGate.isRefetching}
        onRetry={accessGate.onRetry}
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
