import { useEffect, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { BacklinksFilterPanel } from "./BacklinksFilterPanel";
import { BacklinksTable } from "./BacklinksTable";
import { ReferringDomainsTable } from "./ReferringDomainsTable";
import { TopPagesTable } from "./TopPagesTable";
import type {
  BacklinksSearchState,
  BacklinksTabRows,
} from "./backlinksPageTypes";
import { TAB_DESCRIPTIONS } from "./backlinksPageUtils";
import {
  BacklinksActionsMenu,
  BacklinksExportMenu,
} from "./BacklinksToolbarMenus";
import { buildBacklinksTabExport } from "./export";
import type { BacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import { useAhrefsDomainRatings } from "./useAhrefsDomainRatings";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  BACKLINKS_PAGE_SIZES,
  type BacklinksTab,
} from "@/types/schemas/backlinks";

const BACKLINKS_RESULTS_TABS: Array<{
  tab: BacklinksSearchState["tab"];
  label: string;
}> = [
  { tab: "backlinks", label: "Backlinks" },
  { tab: "domains", label: "Referring Domains" },
  { tab: "pages", label: "Top Pages" },
];

export function BacklinksResultsCard({
  projectId,
  activeTab,
  tabRows,
  filters,
  sorting,
  view,
  domainExpansion,
  isTabLoading,
  tabErrorMessage,
  exportTarget,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
  onTabChange,
  onViewChange,
}: {
  projectId: string;
  activeTab: BacklinksSearchState["tab"];
  tabRows: BacklinksTabRows;
  filters: BacklinksFiltersState;
  sorting: SortingState;
  view: "all" | undefined;
  domainExpansion: BacklinksDomainExpansion;
  isTabLoading: boolean;
  tabErrorMessage: string | null;
  exportTarget: string;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number | null;
    hasNextPage: boolean;
    isFetching: boolean;
  };
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  onSortingChange: OnChangeFn<SortingState>;
  onTabChange: (tab: BacklinksSearchState["tab"]) => void;
  onViewChange: (view: "all" | undefined) => void;
}) {
  const {
    ratings: domainRatings,
    isLoading: isLoadingRatings,
    loadRatings,
  } = useAhrefsDomainRatings(projectId);
  const activeFilterCount = filters[activeTab].activeFilterCount;
  const exportTable = useMemo(
    () =>
      buildBacklinksTabExport({ tab: activeTab, rows: tabRows, domainRatings }),
    [activeTab, domainRatings, tabRows],
  );
  // Domains keyed by both tables that the DR column can enrich. Each table
  // holds the currently loaded page, so this changes as the user paginates.
  const ratableDomains = useMemo(
    () => collectRatableDomains(tabRows),
    [tabRows],
  );
  // Once the user has opted in, keep newly loaded domains enriched without a
  // re-click (e.g. after paging or switching to the Referring Domains tab).
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
          <div role="tablist" className="tabs tabs-border w-fit">
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

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-base-300">
        <button
          className={`btn btn-ghost btn-sm gap-1.5 ${filters.showFilters ? "btn-active" : ""}`}
          onClick={() => filters.setShowFilters((current) => !current)}
          title="Toggle table filters"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {activeTab === "backlinks" ? (
          <div
            role="tablist"
            aria-label="Backlinks view"
            className="ml-auto tabs tabs-border tabs-xs w-fit"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view !== "all"}
              className={`tab ${view !== "all" ? "tab-active" : ""}`}
              title="Show each referring domain's strongest link; expand a row for the rest"
              onClick={() => onViewChange(undefined)}
            >
              One per domain
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "all"}
              className={`tab ${view === "all" ? "tab-active" : ""}`}
              title="List every individual backlink"
              onClick={() => onViewChange("all")}
            >
              All links
            </button>
          </div>
        ) : null}
      </div>

      {filters.showFilters ? (
        <BacklinksFilterPanel
          activeTab={activeTab}
          filters={filters}
          onApplied={() => onPageChange(1)}
        />
      ) : null}

      <div className="p-4">
        {tabErrorMessage ? (
          <div className="alert alert-error mb-3">
            <span>{tabErrorMessage}</span>
          </div>
        ) : null}
        {isTabLoading && !tabErrorMessage ? (
          <TabLoadingState label={TAB_LOADING_LABELS[activeTab]} />
        ) : null}
        {!isTabLoading && !tabErrorMessage ? (
          <>
            {activeTab === "backlinks" ? (
              <BacklinksTable
                rows={tabRows.backlinks}
                domainRatings={domainRatings}
                sorting={sorting}
                onSortingChange={onSortingChange}
                expansion={view === "all" ? null : domainExpansion}
              />
            ) : null}
            {activeTab === "domains" ? (
              <ReferringDomainsTable
                rows={tabRows.referringDomains}
                domainRatings={domainRatings}
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
            ) : null}
            {activeTab === "pages" ? (
              <TopPagesTable
                rows={tabRows.topPages}
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {/* Kept visible on tab errors so a failing page still offers a way back. */}
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        pageSizes={BACKLINKS_PAGE_SIZES}
        totalCount={pagination.totalCount}
        hasNextPage={pagination.hasNextPage}
        isLoading={pagination.isFetching}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}

const TAB_LOADING_LABELS: Record<BacklinksTab, string> = {
  backlinks: "Loading backlinks",
  domains: "Loading referring domains",
  pages: "Loading top pages",
};

/** Unique domains the DR column keys on, from both the backlinks and referring
 * domains tables, normalized to match how each table renders its domain. */
function collectRatableDomains(tabRows: BacklinksTabRows): string[] {
  const domains = [
    ...tabRows.backlinks.map((row) => row.domainFrom?.replace(/^www\./, "")),
    ...tabRows.referringDomains.map((row) => row.domain),
  ];
  return [
    ...new Set(domains.filter((domain): domain is string => Boolean(domain))),
  ];
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
