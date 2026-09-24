import { useMemo, useState } from "react";
import { type SortingState } from "@tanstack/react-table";
import {
  ChevronDown,
  Download,
  Sheet,
  SlidersHorizontal,
} from "@/client/components/icons";
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

import { Badge } from "@/client/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
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
  };

  const handleExportSheets = () => {
    void exportTableToSheets({
      headers: exportTable.headers,
      rows: exportTable.rows,
      feature: `brand_lookup_${activeTab}`,
    });
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
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Tabs value={queriesActive ? "queries" : "pages"}>
          <TabsList className="w-fit">
            <TabsTrigger
              value={"queries"}
              onClick={() => setActiveTab("queries")}
            >
              Queries
            </TabsTrigger>
            <TabsTrigger value={"pages"} onClick={() => setActiveTab("pages")}>
              Cited sources
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={!canExport}
              />
            }
          >
            <Download className="size-3.5" />
            Export
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={handleExportSheets}
              disabled={!canExport}
            >
              <Sheet className="size-4" />
              Google Sheets
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCsv} disabled={!canExport}>
              <Download className="size-4" />
              CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className={`gap-1.5 ${filters.showFilters ? "bg-secondary text-foreground" : ""}`}
          onClick={() => filters.setShowFilters((current) => !current)}
          title="Toggle table filters"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {currentFilterCount > 0 ? (
            <Badge variant="primary">{currentFilterCount}</Badge>
          ) : null}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          {activeTab === "pages" ? (
            <>
              {isUrlScoped ? "Cited pages within " : "Pages cited alongside "}
              <strong className="text-foreground">
                {result.resolvedTarget}
              </strong>
              {isUrlScoped ? "." : " in AI answers."} Prompt examples come from
              the fetched sample.
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
        </span>
        {captionPlatform ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
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
        <TopPagesTable
          table={pagesTable}
          // The provider only returns the domain's top cited pages, so a URL
          // scope can filter every sampled row away without meaning zero
          // citations exist for that section.
          emptyMessage={
            isUrlScoped
              ? `None of this domain's top cited pages fall under ${result.resolvedTarget}. Broaden the scope to see domain-level citations.`
              : undefined
          }
        />
      ) : (
        <TopQueriesTable
          table={queriesTable}
          emptyMessage={
            isUrlScoped
              ? `No sampled prompts cited a page under ${result.resolvedTarget}. Broaden the scope to see domain-level prompts.`
              : undefined
          }
        />
      )}
    </Card>
  );
}
