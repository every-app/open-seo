import { useMemo, useState } from "react";
import { type SortingState } from "@tanstack/react-table";
import { ChevronDown, Download, Sheet, SlidersHorizontal } from "lucide-react";
import { useAppTable } from "@/client/components/table/AppDataTable";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import {
  buildBrandLookupExport,
  downloadBrandLookupCsv,
} from "@/client/features/ai-search/components/brandLookupExport";
import { BrandLookupFilterPanel } from "@/client/features/ai-search/components/BrandLookupFilterPanel";
import {
  TopPagesTable,
  TopQueriesTable,
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

// DaisyUI focus-dropdowns stay open until the active element blurs.
function closeExportMenu(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

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
  const filters = useBrandLookupFilters();

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
  const targetDomain =
    result.detectedTargetType === "domain" ? result.resolvedTarget : null;

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
        brand: result.resolvedTarget,
      }),
    [showPagePlatform, targetDomain, projectId, result.resolvedTarget],
  );
  const queriesColumns = useMemo(
    () =>
      buildTopQueriesColumns({
        showPlatform: showQueryPlatform,
        projectId,
        brand: result.resolvedTarget,
      }),
    [showQueryPlatform, projectId, result.resolvedTarget],
  );

  const pagesTable = useAppTable({
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
  const queriesTable = useAppTable({
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

  const handleExportCsv = () => {
    downloadBrandLookupCsv(activeTab, result.resolvedTarget, exportTable);
    closeExportMenu();
  };

  const handleExportSheets = () => {
    void exportTableToSheets({
      headers: exportTable.headers,
      rows: exportTable.rows,
      feature: `brand_lookup_${activeTab}`,
    });
    closeExportMenu();
  };

  const canExport = exportTable.rows.length > 0;

  const currentFilterCount = filters[activeTab].activeFilterCount;
  const queriesActive = activeTab === "queries";
  const pagesActive = activeTab === "pages";

  // When the active tab's platform column is hidden, surface the lone platform
  // once here instead of repeating it on every row.
  const activePlatforms = pagesActive ? pagePlatforms : queryPlatforms;
  const captionPlatform =
    activePlatforms.length === 1 ? activePlatforms[0] : null;

  return (
    <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
        <div role="tablist" className="tabs tabs-border w-fit">
          <button
            type="button"
            role="tab"
            aria-selected={queriesActive}
            className={`tab ${queriesActive ? "tab-active" : ""}`}
            onClick={() => setActiveTab("queries")}
          >
            Queries
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pagesActive}
            className={`tab ${pagesActive ? "tab-active" : ""}`}
            onClick={() => setActiveTab("pages")}
          >
            Cited sources
          </button>
        </div>

        <div className="dropdown dropdown-end">
          <div
            tabIndex={0}
            role="button"
            className={`btn btn-ghost btn-sm gap-1.5 ${canExport ? "" : "btn-disabled"}`}
          >
            <Download className="size-3.5" />
            Export
            <ChevronDown className="size-3.5" />
          </div>
          <ul
            tabIndex={0}
            className="menu dropdown-content z-10 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-1 shadow"
          >
            <li>
              <button
                type="button"
                onClick={handleExportSheets}
                disabled={!canExport}
              >
                <Sheet className="size-4" />
                Google Sheets
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!canExport}
              >
                <Download className="size-4" />
                CSV
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-base-300 px-4 py-2">
        <button
          type="button"
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

      <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-2 text-xs text-base-content/60">
        <span>
          {activeTab === "pages" ? (
            <>
              Pages cited alongside{" "}
              <strong className="text-base-content/80">
                {result.resolvedTarget}
              </strong>{" "}
              in AI answers. Prompt examples come from the fetched sample.
            </>
          ) : (
            <>
              Fetched sample of prompts whose AI answer cited{" "}
              <strong className="text-base-content/80">
                {result.resolvedTarget}
              </strong>{" "}
              in its text or sources.
            </>
          )}
        </span>
        {captionPlatform ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-base-content/70">
            <span
              className={`size-1.5 rounded-full ${PLATFORM_DOT_CLASS[captionPlatform]}`}
            />
            {formatPlatformLabel(captionPlatform)}
          </span>
        ) : null}
      </div>

      {filters.showFilters ? (
        <BrandLookupFilterPanel activeTab={activeTab} filters={filters} />
      ) : null}

      {activeTab === "pages" ? (
        <TopPagesTable table={pagesTable} />
      ) : (
        <TopQueriesTable table={queriesTable} />
      )}
    </section>
  );
}
