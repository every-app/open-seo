import { useMemo, useState } from "react";
import { type SortingState } from "@tanstack/react-table";
import { ExportMenu } from "@/client/components/ExportMenu";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import {
  DataTableFilterToggle,
  DataTableTabs,
  DataTableToolbar,
} from "@/client/components/table/DataTableToolbar";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { exportRows } from "@/client/lib/exportRows";
import {
  buildBrandLookupExport,
  brandLookupExportFilename,
} from "@/client/features/ai-search/components/brandLookupExport";
import { BrandLookupFilterPanel } from "@/client/features/ai-search/components/BrandLookupFilterPanel";
import {
  buildTopPagesColumns,
  buildTopQueriesColumns,
} from "@/client/features/ai-search/components/BrandLookupCitationTables";
import {
  formatPlatformLabel,
  PLATFORM_DOT_CLASS,
} from "@/client/features/ai-search/platformLabels";
import {
  filterQueries,
  filterTopPages,
} from "@/client/features/ai-search/brandLookupFiltering";
import { useBrandLookupFilters } from "@/client/features/ai-search/useBrandLookupFilters";
import type { CitationTab } from "@/client/features/ai-search/brandLookupFilterTypes";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

const DEFAULT_PAGES_SORT: SortingState = [{ id: "capturedVolume", desc: true }];
const DEFAULT_QUERIES_SORT: SortingState = [
  { id: "aiSearchVolume", desc: true },
];

export function CitationTabsCard({
  result,
  projectId,
}: {
  result: BrandLookupResult;
  projectId: string;
}) {
  const [activeTab, setActiveTab] = useState<CitationTab>("queries");
  const [pagesSort, setPagesSort] = useState<SortingState>(DEFAULT_PAGES_SORT);
  const [queriesSort, setQueriesSort] =
    useState<SortingState>(DEFAULT_QUERIES_SORT);
  const filters = useBrandLookupFilters(projectId);

  // The platform column only earns its place when a tab actually spans >1
  // platform; otherwise it repeats one value on every row.
  const queryPlatforms = [
    ...new Set(result.topQueries.map((query) => query.platform)),
  ];
  const pagePlatforms = [
    ...new Set(result.topPages.map((page) => page.platform)),
  ];
  const showQueryPlatform = queryPlatforms.length > 1;
  const showPagePlatform = pagePlatforms.length > 1;
  // Under a URL scope `resolvedTarget` carries the path; the "You" badge and
  // the Prompt Explorer brand highlight both want the bare hostname.
  const targetDomain =
    result.detectedTargetType === "domain"
      ? result.resolvedTarget.split("/")[0]
      : null;
  const brand = targetDomain ?? result.resolvedTarget;
  // Page rows are already narrowed server-side; say so instead of implying the
  // pre-scope "everything cited alongside the brand" set.
  const isUrlScoped = result.aggregatesAreDomainLevel;

  const filteredPages = useMemo(
    () => filterTopPages(result.topPages, filters.pages.values),
    [result.topPages, filters.pages.values],
  );
  const filteredQueries = useMemo(
    () => filterQueries(result.topQueries, filters.queries.values),
    [result.topQueries, filters.queries.values],
  );

  const pagesColumns = useMemo(
    () =>
      buildTopPagesColumns({
        showPlatform: showPagePlatform,
        targetDomain,
        projectId,
        brand,
      }),
    [showPagePlatform, targetDomain, projectId, brand],
  );
  const queriesColumns = useMemo(
    () =>
      buildTopQueriesColumns({
        showPlatform: showQueryPlatform,
        projectId,
        brand,
      }),
    [showQueryPlatform, projectId, brand],
  );

  const pagesTable = useDataTable({
    data: filteredPages,
    columns: pagesColumns,
    state: { sorting: pagesSort },
    onSortingChange: setPagesSort,
    withSorting: true,
    // Stable identity (default is the array index): KeywordsCell holds
    // expanded state, which must follow the page when filtering/sorting
    // reorders rows, not stick to whatever row lands in the same slot.
    getRowId: (row) => `${row.platform}:${row.url}`,
  });
  const queriesTable = useDataTable({
    data: filteredQueries,
    columns: queriesColumns,
    state: { sorting: queriesSort },
    onSortingChange: setQueriesSort,
    withSorting: true,
  });

  // Not memoized: TanStack's `getSortedRowModel()` is internally cached, and
  // memoing on the table refs alone (which are stable across renders) would
  // serve stale data when sort or filters change.
  const exportTable = buildBrandLookupExport(
    activeTab,
    pagesTable.getSortedRowModel().rows.map((row) => row.original),
    queriesTable.getSortedRowModel().rows.map((row) => row.original),
  );

  const handleExport = (format: "csv" | "sheets") => {
    void exportRows({
      format,
      feature: `brand_lookup_${activeTab}`,
      ...exportTable,
      filename: brandLookupExportFilename(activeTab, result.resolvedTarget),
    });
  };

  const canExport = exportTable.rows.length > 0;

  const currentFilterCount = filters[activeTab].activeFilterCount;
  const pagesActive = activeTab === "pages";

  // When the active tab's platform column is hidden, surface the lone platform
  // once here instead of repeating it on every row.
  const activePlatforms = pagesActive ? pagePlatforms : queryPlatforms;
  const captionPlatform =
    activePlatforms.length === 1 ? activePlatforms[0] : null;

  const toolbar = (
    <>
      <DataTableTabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value === "pages" ? "pages" : "queries")
        }
        description={
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="min-w-0 break-words">
              {pagesActive ? (
                <>
                  {isUrlScoped
                    ? "Cited pages within "
                    : "Pages cited alongside "}
                  <strong className="text-foreground">
                    {result.resolvedTarget}
                  </strong>
                  {isUrlScoped ? "." : " in AI answers."} Prompt examples come
                  from the fetched sample.
                </>
              ) : (
                <>
                  Fetched sample of prompts whose AI answer cited{" "}
                  {isUrlScoped ? "a page within " : null}
                  <strong className="text-foreground">
                    {result.resolvedTarget}
                  </strong>
                  {isUrlScoped ? "." : " in its text or sources."}
                </>
              )}
            </p>
            {captionPlatform ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
                <span
                  className={`size-1.5 rounded-full ${PLATFORM_DOT_CLASS[captionPlatform]}`}
                />
                {formatPlatformLabel(captionPlatform)}
              </span>
            ) : null}
          </div>
        }
      >
        <TabsTrigger value="queries">Queries</TabsTrigger>
        <TabsTrigger value="pages">Cited sources</TabsTrigger>
      </DataTableTabs>
      <DataTableToolbar
        actions={
          <ExportMenu
            actions={["sheets", "csv"]}
            onExport={handleExport}
            disabled={!canExport}
          />
        }
      >
        <DataTableFilterToggle
          open={filters.showFilters}
          activeCount={currentFilterCount}
          onToggle={() => filters.setShowFilters((current) => !current)}
        />
      </DataTableToolbar>

      {filters.showFilters ? (
        <BrandLookupFilterPanel activeTab={activeTab} filters={filters} />
      ) : null}
    </>
  );

  const tableProps = {
    toolbar,
    isFiltered: currentFilterCount > 0,
    onClearFilters: filters[activeTab].reset,
  };

  // The provider only returns the domain's top cited pages, so a URL scope can
  // filter every sampled row away without meaning zero citations exist for
  // that section.
  return pagesActive ? (
    <DataTable
      table={pagesTable}
      empty={{
        title: isUrlScoped
          ? `None of this domain's top cited pages fall under ${result.resolvedTarget}.`
          : "No cited sources to show.",
        description: isUrlScoped
          ? "Broaden the scope to see domain-level citations."
          : undefined,
      }}
      {...tableProps}
    />
  ) : (
    <DataTable
      table={queriesTable}
      empty={{
        title: isUrlScoped
          ? `No sampled prompts cited a page under ${result.resolvedTarget}.`
          : "No matching queries found.",
        description: isUrlScoped
          ? "Broaden the scope to see domain-level prompts."
          : undefined,
      }}
      {...tableProps}
    />
  );
}
