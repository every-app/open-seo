import { useEffect, useMemo, useState } from "react";
import {
  BacklinksOverviewPanels,
  BacklinksResultsCard,
} from "./BacklinksPageSections";
import {
  BacklinksAccessLoadingState,
  BacklinksEmptyState,
  BacklinksErrorState,
  BacklinksLoadingState,
  BacklinksSetupGate,
} from "./BacklinksPageStates";
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
  isAccessStatusLoading: boolean;
  overviewData: BacklinksOverviewData | undefined;
  overviewError: string | null;
  overviewLoading: boolean;
  referringDomains: BacklinksReferringDomainsData | undefined;
  searchState: BacklinksSearchState;
  tabErrorMessage: string | null;
  tabLoading: boolean;
  testError: string | null;
  testIsPending: boolean;
  topPages: BacklinksTopPagesData | undefined;
  onRetryAccess: () => void;
  onSetActiveTab: (tab: BacklinksSearchState["tab"]) => void;
  onRetryOverview: () => void;
  onTestAccess: () => void;
};

export function BacklinksBody({
  accessStatus,
  accessStatusError,
  backlinksDisabledByError,
  backlinksEnabled,
  isAccessStatusLoading,
  overviewData,
  overviewError,
  overviewLoading,
  referringDomains,
  searchState,
  tabErrorMessage,
  tabLoading,
  testError,
  testIsPending,
  topPages,
  onRetryAccess,
  onSetActiveTab,
  onRetryOverview,
  onTestAccess,
}: BacklinksBodyProps) {
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

  return (
    <BacklinksContent
      data={overviewData}
      errorMessage={overviewError}
      isLoading={overviewLoading}
      referringDomains={referringDomains}
      searchState={searchState}
      tabErrorMessage={tabErrorMessage}
      tabLoading={tabLoading}
      topPages={topPages}
      onSetActiveTab={onSetActiveTab}
      onRetry={onRetryOverview}
    />
  );
}

function BacklinksContent({
  data,
  errorMessage,
  isLoading,
  referringDomains,
  searchState,
  tabErrorMessage,
  tabLoading,
  topPages,
  onSetActiveTab,
  onRetry,
}: {
  data: BacklinksOverviewData | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  referringDomains: BacklinksReferringDomainsData | undefined;
  searchState: BacklinksSearchState;
  tabErrorMessage: string | null;
  tabLoading: boolean;
  topPages: BacklinksTopPagesData | undefined;
  onSetActiveTab: (tab: BacklinksSearchState["tab"]) => void;
  onRetry: () => void;
}) {
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    setFilterText("");
  }, [searchState.target, searchState.status, searchState.tab]);

  const mergedData = useMemo(
    () => mergeTabData(data, referringDomains, topPages),
    [data, referringDomains, topPages],
  );
  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredData = useMemo(
    () => filterOverviewData(mergedData, normalizedFilter),
    [mergedData, normalizedFilter],
  );
  const summaryStats = useMemo(
    () => buildSummaryStats(mergedData),
    [mergedData],
  );

  if (!searchState.target) {
    return <BacklinksEmptyState />;
  }

  if (isLoading) {
    return <BacklinksLoadingState />;
  }

  if (!mergedData) {
    return (
      <BacklinksErrorState errorMessage={errorMessage} onRetry={onRetry} />
    );
  }

  return (
    <>
      <BacklinksOverviewPanels data={mergedData} summaryStats={summaryStats} />
      <BacklinksResultsCard
        activeTab={searchState.tab}
        filteredData={filteredData}
        filterText={filterText}
        isTabLoading={searchState.tab !== "backlinks" && tabLoading}
        tabErrorMessage={
          searchState.tab !== "backlinks" ? tabErrorMessage : null
        }
        onFilterTextChange={setFilterText}
        onSetActiveTab={onSetActiveTab}
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
) {
  if (!data) {
    return { backlinks: [], referringDomains: [], topPages: [] };
  }

  return {
    backlinks: data.backlinks.filter((row) => {
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
