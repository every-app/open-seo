import { useEffect, useMemo } from "react";
import { List, Rows3 } from "lucide-react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { BacklinksFilterPanel } from "./BacklinksFilterPanel";
import { backlinksFilterConditionLimit } from "./backlinksFilterTypes";
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
  BacklinksBestLinksMenu,
} from "./BacklinksToolbarMenus";
import { buildBacklinksTabExport, buildBacklinksTabFilename } from "./export";
import type { BacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import { useAhrefsDomainRatings } from "./useAhrefsDomainRatings";
import { TablePagination } from "@/client/components/table/TablePagination";
import { BACKLINKS_PAGE_SIZES } from "@/types/schemas/backlinks";
import type { ResearchScope } from "@/shared/researchScope";
import { ExportMenu } from "@/client/components/ExportMenu";
import { QueryError } from "@/client/components/QueryState";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import type { DataTableFrameProps } from "@/client/components/table/DataTable";
import {
  DataTableFilterToggle,
  DataTableTabs,
  DataTableToolbar,
} from "@/client/components/table/DataTableToolbar";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { exportRows } from "@/client/lib/exportRows";

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
  scope,
  tabRows,
  filters,
  sorting,
  view,
  hideSpam,
  onHideSpamChange,
  domainExpansion,
  isTabLoading,
  showTable,
  tabErrorMessage,
  tabError,
  onRetryTab,
  isTabRetrying,
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
  scope: ResearchScope;
  tabRows: BacklinksTabRows;
  filters: BacklinksFiltersState;
  sorting: SortingState;
  view: "all" | undefined;
  hideSpam: boolean;
  onHideSpamChange: (hideSpam: boolean) => void;
  domainExpansion: BacklinksDomainExpansion;
  isTabLoading: boolean;
  showTable: boolean;
  tabErrorMessage: string | null;
  tabError?: unknown;
  onRetryTab?: () => void;
  isTabRetrying: boolean;
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

  const filterState = filters[activeTab];
  const frame: DataTableFrameProps = {
    isLoading: isTabLoading,
    isFiltered: activeFilterCount > 0,
    onClearFilters: () => {
      filterState.reset();
      onPageChange(1);
    },
    error: tabErrorMessage ? (
      <QueryError
        cause={tabError}
        fallback={tabErrorMessage}
        onRetry={onRetryTab}
        isRetrying={isTabRetrying}
      />
    ) : null,
    toolbar: (
      <>
        <DataTableTabs
          value={activeTab}
          onValueChange={(value) => {
            const next = BACKLINKS_RESULTS_TABS.find(
              (item) => item.tab === value,
            );
            if (next) onTabChange(next.tab);
          }}
          description={TAB_DESCRIPTIONS[activeTab]}
        >
          {BACKLINKS_RESULTS_TABS.filter(
            // Referring domains can't be filtered to a path prefix.
            ({ tab }) => !(scope === "subfolder" && tab === "domains"),
          ).map(({ label, tab }) => (
            <TabsTrigger key={tab} value={tab}>
              {label}
            </TabsTrigger>
          ))}
        </DataTableTabs>
        <DataTableToolbar
          actions={
            <>
              <ExportMenu
                actions={["sheets", "csv"]}
                scopes={[{ id: "page", label: "Current page · selected view" }]}
                disabled={exportTable.rows.length === 0}
                onExport={(format) =>
                  void exportRows({
                    format,
                    feature: `backlinks_${activeTab}`,
                    ...exportTable,
                    filename: buildBacklinksTabFilename(
                      activeTab,
                      exportTarget,
                    ),
                  })
                }
              />
              {activeTab !== "pages" ? (
                <BacklinksActionsMenu
                  isLoadingRatings={isLoadingRatings}
                  loadRatings={loadRatings}
                  ratableDomains={ratableDomains}
                />
              ) : null}
            </>
          }
        >
          <DataTableFilterToggle
            open={filters.showFilters}
            activeCount={activeFilterCount}
            onToggle={() => filters.setShowFilters((current) => !current)}
          />
          {activeTab === "backlinks" ? (
            <>
              <BacklinksBestLinksMenu
                hideSpam={hideSpam}
                onHideSpamChange={onHideSpamChange}
              />
              <SegmentedToggle
                showLabels
                value={view ?? "one"}
                onChange={(next) =>
                  onViewChange(next === "all" ? "all" : undefined)
                }
                items={[
                  {
                    value: "one",
                    icon: <Rows3 />,
                    label: "One per domain",
                  },
                  { value: "all", icon: <List />, label: "All links" },
                ]}
              />
            </>
          ) : null}
        </DataTableToolbar>
        {filters.showFilters ? (
          <BacklinksFilterPanel
            activeTab={activeTab}
            filters={filters}
            onApplied={() => onPageChange(1)}
            // Restored filters are also checked before the query can run.
            maxConditions={backlinksFilterConditionLimit(
              scope,
              activeTab === "backlinks" && hideSpam,
            )}
          />
        ) : null}
      </>
    ),
    // Kept visible on tab errors so a failing page still offers a way back.
    footer: (
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
    ),
  };

  return (
    <>
      {/* A filter budget error hides the rows: the query never ran for the
          current filters. */}
      {activeTab === "backlinks" ? (
        <BacklinksTable
          rows={showTable ? tabRows.backlinks : []}
          domainRatings={domainRatings}
          sorting={sorting}
          onSortingChange={onSortingChange}
          expansion={view === "all" ? null : domainExpansion}
          {...frame}
        />
      ) : null}
      {activeTab === "domains" ? (
        <ReferringDomainsTable
          rows={showTable ? tabRows.referringDomains : []}
          domainRatings={domainRatings}
          sorting={sorting}
          onSortingChange={onSortingChange}
          {...frame}
        />
      ) : null}
      {activeTab === "pages" ? (
        <TopPagesTable
          rows={showTable ? tabRows.topPages : []}
          sorting={sorting}
          onSortingChange={onSortingChange}
          {...frame}
        />
      ) : null}
    </>
  );
}

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
