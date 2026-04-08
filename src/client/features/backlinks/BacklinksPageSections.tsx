import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { ArrowLeft } from "lucide-react";
import {
  BacklinksNewLostChart,
  BacklinksTrendChart,
} from "./BacklinksPageCharts";
import { ResultsHeader } from "./BacklinksResultsHeader";
import { BacklinksTable } from "./BacklinksTable";
import { ReferringDomainsTable } from "./ReferringDomainsTable";
import { TopPagesTable } from "./TopPagesTable";
import type {
  BacklinksOverviewData,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import { formatRelativeTimestamp } from "./backlinksPageUtils";

export function BacklinksOverviewPanels({
  data,
  onShowHistory,
  summaryStats,
}: {
  data: BacklinksOverviewData;
  onShowHistory: () => void;
  summaryStats: Array<{ label: string; value: string; description: string }>;
}) {
  return (
    <>
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
          onClick={onShowHistory}
        >
          <ArrowLeft className="size-4" />
          Recent searches
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/65">
        <span className="badge badge-outline">{data.scope}</span>
        <span>Target: {data.displayTarget}</span>
        <span>-</span>
        <span>Updated {formatRelativeTimestamp(data.fetchedAt)}</span>
      </div>
      <OverviewGrid data={data} summaryStats={summaryStats} />
      {data.scope === "page" ? (
        <div className="alert alert-info">
          <span>
            Showing backlinks for this exact page. Enter a bare domain for
            site-wide results. Trend charts are only shown for domain-level
            lookups.
          </span>
        </div>
      ) : null}
    </>
  );
}

export function BacklinksResultsCard({
  activeTab,
  filteredData,
  filterText,
  hideSpam,
  spamThreshold,
  isTabLoading,
  tabErrorMessage,
  onFilterTextChange,
  onSetActiveTab,
  onSetHideSpam,
  onSetSpamThreshold,
  exportTarget,
}: {
  activeTab: BacklinksSearchState["tab"];
  filteredData: {
    backlinks: BacklinksOverviewData["backlinks"];
    referringDomains: BacklinksOverviewData["referringDomains"];
    topPages: BacklinksOverviewData["topPages"];
  };
  filterText: string;
  hideSpam: boolean;
  spamThreshold: number;
  isTabLoading: boolean;
  tabErrorMessage: string | null;
  onFilterTextChange: (value: string) => void;
  onSetActiveTab: (tab: BacklinksSearchState["tab"]) => void;
  onSetHideSpam: (hideSpam: boolean) => void;
  onSetSpamThreshold: (threshold: number) => void;
  exportTarget: string;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <ResultsHeader
          activeTab={activeTab}
          filterText={filterText}
          hideSpam={hideSpam}
          spamThreshold={spamThreshold}
          onFilterTextChange={onFilterTextChange}
          onSetActiveTab={onSetActiveTab}
          onSetHideSpam={onSetHideSpam}
          onSetSpamThreshold={onSetSpamThreshold}
          filteredData={filteredData}
          exportTarget={exportTarget}
        />
        {tabErrorMessage ? (
          <div className="alert alert-error">
            <span>{tabErrorMessage}</span>
          </div>
        ) : null}
        {activeTab === "backlinks" ? (
          <BacklinksTable rows={filteredData.backlinks} />
        ) : null}
        {activeTab === "domains" && isTabLoading && !tabErrorMessage ? (
          <TabLoadingState label="Loading referring domains" />
        ) : null}
        {activeTab === "domains" && !isTabLoading && !tabErrorMessage ? (
          <ReferringDomainsTable rows={filteredData.referringDomains} />
        ) : null}
        {activeTab === "pages" && isTabLoading && !tabErrorMessage ? (
          <TabLoadingState label="Loading top pages" />
        ) : null}
        {activeTab === "pages" && !isTabLoading && !tabErrorMessage ? (
          <TopPagesTable rows={filteredData.topPages} />
        ) : null}
      </div>
    </div>
  );
}

function OverviewGrid({
  data,
  summaryStats,
}: {
  data: BacklinksOverviewData;
  summaryStats: Array<{ label: string; value: string; description: string }>;
}) {
  const domainScope = data.scope === "domain";

  return (
    <div
      className={`grid grid-cols-1 gap-3 ${domainScope ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}
    >
      <SummaryStatsGrid data={data} summaryStats={summaryStats} />
      {domainScope ? <TrendPanels data={data} /> : null}
    </div>
  );
}

function SummaryStatsGrid({
  data,
  summaryStats,
}: {
  data: BacklinksOverviewData;
  summaryStats: Array<{ label: string; value: string; description: string }>;
}) {
  const cardClassName = `card bg-base-100 border border-base-300 ${data.scope === "domain" ? "md:col-span-2 xl:col-span-1" : ""}`;

  return (
    <div className={cardClassName}>
      <div className="card-body p-4 xl:h-full">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:gap-y-6">
          {summaryStats.map((item) => (
            <div key={item.label}>
              <div className="text-xs uppercase tracking-wide text-base-content/55">
                <HeaderHelpLabel
                  label={item.label}
                  helpText={item.description}
                />
              </div>
              <p className="text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendPanels({ data }: { data: BacklinksOverviewData }) {
  return (
    <>
      <TrendCard
        title="Backlink growth"
        description="Backlinks and referring domains over the last year"
      >
        <BacklinksTrendChart data={data.trends} />
      </TrendCard>
      <TrendCard
        title="New vs lost"
        description="Backlink acquisition and attrition"
      >
        <BacklinksNewLostChart data={data.newLostTrends} />
      </TrendCard>
    </>
  );
}

function TrendCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-2 p-4">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-xs text-base-content/55">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabLoadingState({ label }: { label: string }) {
  return (
    <div className="space-y-3 py-2">
      <p className="text-sm text-base-content/60">{label}...</p>
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-full" />
    </div>
  );
}
