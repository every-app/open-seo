import { useEffect, useMemo, useState } from "react";
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

type BacklinksBodyProps = {
  accessStatus: BacklinksAccessStatusData | undefined;
  accessStatusError: string | null;
  backlinksDisabledByError: boolean;
  backlinksEnabled: boolean;
  history: BacklinksSearchHistoryItem[];
  historyLoaded: boolean;
  isAccessStatusLoading: boolean;
  hideSpam: boolean;
  overviewData: BacklinksOverviewData | undefined;
  overviewError: string | null;
  overviewLoading: boolean;
  referringDomains: BacklinksReferringDomainsData | undefined;
  searchState: BacklinksSearchState;
  spamThreshold: number;
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
  onSetHideSpam: (hideSpam: boolean) => void;
  onSetSpamThreshold: (threshold: number) => void;
};

export function BacklinksBody({
  accessStatus,
  accessStatusError,
  backlinksDisabledByError,
  backlinksEnabled,
  history,
  historyLoaded,
  isAccessStatusLoading,
  hideSpam,
  overviewData,
  overviewError,
  overviewLoading,
  referringDomains,
  searchState,
  spamThreshold,
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
  onSetHideSpam,
  onSetSpamThreshold,
}: BacklinksBodyProps) {
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    setFilterText("");
  }, [searchState.target, searchState.tab]);

  const mergedData = useMemo(
    () => mergeTabData(overviewData, referringDomains, topPages),
    [overviewData, referringDomains, topPages],
  );
  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredData = useMemo(
    () =>
      filterOverviewData(
        mergedData,
        normalizedFilter,
        searchState.tab,
        hideSpam,
        spamThreshold,
      ),
    [hideSpam, mergedData, normalizedFilter, searchState.tab, spamThreshold],
  );
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
        filterText={filterText}
        hideSpam={hideSpam}
        spamThreshold={spamThreshold}
        isTabLoading={searchState.tab !== "backlinks" && tabLoading}
        tabErrorMessage={
          searchState.tab !== "backlinks" ? tabErrorMessage : null
        }
        onFilterTextChange={setFilterText}
        onSetActiveTab={onSetActiveTab}
        onSetHideSpam={onSetHideSpam}
        onSetSpamThreshold={onSetSpamThreshold}
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

function filterOverviewData(
  data: BacklinksOverviewData | undefined,
  normalizedFilter: string,
  activeTab: BacklinksSearchState["tab"],
  hideSpam: boolean,
  spamThreshold: number,
) {
  if (!data) {
    return { backlinks: [], referringDomains: [], topPages: [] };
  }

  const backlinksRows =
    activeTab === "backlinks" && hideSpam
      ? data.backlinks.filter(
          (row) => row.spamScore == null || row.spamScore <= spamThreshold,
        )
      : data.backlinks;

  return {
    backlinks: backlinksRows.filter((row) => {
      if (!normalizedFilter) return true;
      return [row.domainFrom, row.urlFrom, row.urlTo, row.anchor, row.itemType]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedFilter));
    }),
    referringDomains: data.referringDomains.filter((row) => {
      if (!normalizedFilter) return true;
      return row.domain?.toLowerCase().includes(normalizedFilter) ?? false;
    }),
    topPages: data.topPages.filter((row) => {
      if (!normalizedFilter) return true;
      return row.page?.toLowerCase().includes(normalizedFilter) ?? false;
    }),
  };
}
