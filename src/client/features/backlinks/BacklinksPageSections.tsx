import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import {
  BacklinksNewLostChart,
  BacklinksTrendChart,
} from "./BacklinksPageCharts";
import { BacklinksFilterPanel } from "./BacklinksFilterPanel";
import { BacklinksTable } from "./BacklinksTable";
import { ReferringDomainsTable } from "./ReferringDomainsTable";
import { TopPagesTable } from "./TopPagesTable";
import type {
  BacklinksOverviewData,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import {
  TAB_DESCRIPTIONS,
  formatRelativeTimestamp,
} from "./backlinksPageUtils";
import {
  BacklinksActionsMenu,
  BacklinksExportMenu,
} from "./BacklinksToolbarMenus";
import { buildBacklinksTabExport } from "./export";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import { useAhrefsDomainRatings } from "./useAhrefsDomainRatings";

const BACKLINKS_RESULTS_TABS: Array<{
  tab: BacklinksSearchState["tab"];
  label: string;
}> = [
  { tab: "backlinks", label: "Backlinks" },
  { tab: "domains", label: "Referring Domains" },
  { tab: "pages", label: "Top Pages" },
];

export function BacklinksOverviewPanels({
  projectId,
  data,
  summaryStats,
}: {
  projectId: string;
  data: BacklinksOverviewData;
  summaryStats: Array<{ label: string; value: string; description: string }>;
}) {
  return (
    <>
      <div>
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{ target: undefined, scope: undefined, tab: undefined }}
          replace
          className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
        >
          <ArrowLeft className="size-4" />
          Recent searches
        </Link>
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
  projectId,
  activeTab,
  filteredData,
  filters,
  isTabLoading,
  tabErrorMessage,
  exportTarget,
  onTabChange,
}: {
  projectId: string;
  activeTab: BacklinksSearchState["tab"];
  filteredData: {
    backlinks: BacklinksOverviewData["backlinks"];
    referringDomains: BacklinksOverviewData["referringDomains"];
    topPages: BacklinksOverviewData["topPages"];
  };
  filters: BacklinksFiltersState;
  isTabLoading: boolean;
  tabErrorMessage: string | null;
  exportTarget: string;
  onTabChange: (tab: BacklinksSearchState["tab"]) => void;
}) {
  const currentFilterCount = filters[activeTab].activeFilterCount;
  const exportTable = useMemo(
    () => buildBacklinksTabExport({ tab: activeTab, rows: filteredData }),
    [activeTab, filteredData],
  );
  const {
    ratings: domainRatings,
    isLoading: isLoadingRatings,
    loadRatings,
  } = useAhrefsDomainRatings(projectId);
  // Domains keyed by both tables that the DR column can enrich. The Referring
  // Domains list loads lazily, so this grows once that tab is opened.
  const ratableDomains = useMemo(
    () => collectRatableDomains(filteredData),
    [filteredData],
  );
  // Once the user has opted in, keep newly loaded domains enriched without a
  // re-click (e.g. after switching to the lazily-loaded Referring Domains tab).
  // KV-cached, so re-requesting already-known domains is nearly free.
  useEffect(() => {
    if (!domainRatings) return;
    const missing = ratableDomains.filter(
      (domain) => !Object.hasOwn(domainRatings, domain),
    );
    if (missing.length > 0) void loadRatings(missing);
  }, [domainRatings, ratableDomains, loadRatings]);

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
        <div className="space-y-2">
          <div role="tablist" className="tabs tabs-box w-fit">
            {BACKLINKS_RESULTS_TABS.map(({ label, tab }) => (
              <TabLink
                key={tab}
                activeTab={activeTab}
                label={label}
                onSelect={onTabChange}
                tab={tab}
              />
            ))}
          </div>
          <p className="max-w-xl text-sm text-base-content/60">
            {TAB_DESCRIPTIONS[activeTab]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BacklinksExportMenu
            activeTab={activeTab}
            exportTarget={exportTarget}
            filteredData={filteredData}
            headers={exportTable.headers}
            rows={exportTable.rows}
          />
          {activeTab !== "pages" ? (
            <BacklinksActionsMenu
              isLoadingRatings={isLoadingRatings}
              loadRatings={loadRatings}
              ratableDomains={ratableDomains}
            />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300">
        <button
          className={`btn btn-ghost btn-sm gap-1.5 ${filters.showFilters ? "btn-active" : ""}`}
          onClick={() => filters.setShowFilters((current) => !current)}
          title="Toggle table filters"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {currentFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {currentFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      {filters.showFilters ? (
        <BacklinksFilterPanel activeTab={activeTab} filters={filters} />
      ) : null}

      <div className="p-4">
        {tabErrorMessage ? (
          <div className="alert alert-error mb-3">
            <span>{tabErrorMessage}</span>
          </div>
        ) : null}
        {activeTab === "backlinks" ? (
          <BacklinksTable
            rows={filteredData.backlinks}
            domainRatings={domainRatings}
          />
        ) : null}
        {activeTab === "domains" && isTabLoading && !tabErrorMessage ? (
          <TabLoadingState label="Loading referring domains" />
        ) : null}
        {activeTab === "domains" && !isTabLoading && !tabErrorMessage ? (
          <ReferringDomainsTable
            rows={filteredData.referringDomains}
            domainRatings={domainRatings}
          />
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

/** Unique domains the DR column keys on, from both the backlinks and referring
 * domains tables, normalized to match how each table renders its domain. */
function collectRatableDomains(filteredData: {
  backlinks: BacklinksOverviewData["backlinks"];
  referringDomains: BacklinksOverviewData["referringDomains"];
}): string[] {
  const domains = [
    ...filteredData.backlinks.map((row) =>
      row.domainFrom?.replace(/^www\./, ""),
    ),
    ...filteredData.referringDomains.map((row) => row.domain),
  ];
  return [
    ...new Set(domains.filter((domain): domain is string => Boolean(domain))),
  ];
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

function TabLink({
  activeTab,
  label,
  onSelect,
  tab,
}: {
  activeTab: BacklinksSearchState["tab"];
  label: string;
  onSelect: (tab: BacklinksSearchState["tab"]) => void;
  tab: BacklinksSearchState["tab"];
}) {
  const isActive = activeTab === tab;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`tab ${isActive ? "tab-active" : ""}`}
      onClick={() => onSelect(tab)}
    >
      {label}
    </button>
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
