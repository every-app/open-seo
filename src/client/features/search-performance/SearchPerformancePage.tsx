import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { QueryError } from "@/client/components/QueryState";
import { ExportMenu } from "@/client/components/ExportMenu";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { SearchPerformanceDetailSheet } from "@/client/features/search-performance/SearchPerformanceDetailSheet";
import { DimensionSection } from "@/client/features/search-performance/SearchPerformanceDimensionSection";
import { SearchPerformanceOverview } from "@/client/features/search-performance/SearchPerformanceOverview";
import { DATE_RANGE_LABELS } from "@/client/features/search-performance/SearchPerformanceSelects";
import { SearchPerformanceLoadingState } from "@/client/features/search-performance/SearchPerformanceLoadingState";
import {
  tableQueryOptions,
  type DetailSelection,
  type FilterInput,
} from "@/client/features/search-performance/searchPerformanceQueries";
import {
  SearchPerformanceTextFilters,
  type TextFilters,
} from "@/client/features/search-performance/SearchPerformanceTextFilters";
import {
  exportDimensionRows,
  exportStriking,
  StrikingDistanceTable,
  type ExportTarget,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceReport,
} from "@/serverFunctions/searchPerformance";
import {
  SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  SEARCH_PERFORMANCE_TABS,
  type SearchPerformanceSearch,
  type SearchPerformanceTab,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";

function tabDimension(
  tab: SearchPerformanceTab,
): SearchPerformanceTableDimension {
  return tab === "pages" ? "page" : "query";
}

function buildFilterInput({
  type = "web",
  range = "last_28_days",
  device,
  country,
}: Pick<
  SearchPerformanceSearch,
  "type" | "range" | "device" | "country"
>): FilterInput {
  return {
    searchType: type,
    dateRange: range,
    ...(device ? { device } : {}),
    ...(country ? { country } : {}),
  };
}

export function SearchPerformancePage({
  projectId,
  search,
  onSearchChange,
}: {
  projectId: string;
  search: SearchPerformanceSearch;
  onSearchChange: (update: Partial<SearchPerformanceSearch>) => void;
}) {
  const queryClient = useQueryClient();
  const { type, range, country } = search;
  // Discover and Google News report pages only, with no queries or position.
  const isWeb = (type ?? "web") === "web";
  // Google rejects a device filter on Discover, so ignore one left in the URL.
  const device = type === "discover" ? undefined : search.device;
  const textFilters = useMemo<TextFilters>(
    () => ({
      pageFilter: search.pageText
        ? {
            operator: search.pageMatch ?? "contains",
            expression: search.pageText,
          }
        : undefined,
      queryFilter:
        search.queryText && isWeb
          ? {
              operator: search.queryMatch ?? "contains",
              expression: search.queryText,
            }
          : undefined,
    }),
    [
      search.pageText,
      search.pageMatch,
      search.queryText,
      search.queryMatch,
      isWeb,
    ],
  );
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // The query or page whose details are open beside the table.
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const activeFilterCount =
    Number(Boolean(textFilters.pageFilter)) +
    Number(Boolean(textFilters.queryFilter)) +
    Number(Boolean(country)) +
    Number(Boolean(device)) +
    Number(range !== undefined && range !== "last_28_days");
  const tab = isWeb ? (search.tab ?? "striking") : "pages";
  const page = search.page ?? 1;
  const pageSize = search.size ?? SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE;

  const filterInput = {
    ...buildFilterInput({ type, range, device, country }),
    ...textFilters,
  };

  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, filterInput],
    queryFn: () =>
      getSearchPerformanceReport({ data: { projectId, ...filterInput } }),
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;

  const isTableTab = tab === "queries" || tab === "pages";
  const dimension = tabDimension(tab);
  const tableQuery = useQuery({
    ...tableQueryOptions(projectId, dimension, page, pageSize, filterInput),
    enabled: report?.connected === true && isTableTab,
    // Hold the current rows while paging or filtering, but not across a tab
    // or project change: Query rows must not render under the Pages header.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === projectId &&
      previousQuery.queryKey[2] === dimension
        ? previous
        : undefined,
  });

  // Warm the Queries tab (first page) as soon as the report connects so the tab
  // opens instantly instead of showing a spinner. Free first-party GSC data.
  useEffect(() => {
    if (report?.connected !== true || !isWeb) return;
    void queryClient.prefetchQuery(
      tableQueryOptions(
        projectId,
        "query",
        1,
        SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
        {
          ...buildFilterInput({ type, range, device, country }),
          ...textFilters,
        },
      ),
    );
  }, [
    report?.connected,
    isWeb,
    projectId,
    type,
    range,
    device,
    country,
    textFilters,
    queryClient,
  ]);

  const handleExport = async (target: ExportTarget) => {
    if (!report?.connected || reportQuery.isPlaceholderData || isExporting)
      return;
    setIsExporting(true);
    try {
      if (tab === "striking") {
        await exportStriking(report, target);
        return;
      }
      const data = await exportSearchPerformanceTable({
        data: { projectId, dimension, ...filterInput },
      });
      await exportDimensionRows(
        dimension,
        data.rows,
        report.range,
        target,
        isWeb,
      );
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Export failed"));
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () =>
    onSearchChange({
      page: undefined,
      pageText: undefined,
      pageMatch: undefined,
      queryText: undefined,
      queryMatch: undefined,
      country: undefined,
      device: undefined,
      range: undefined,
    });

  const reportError = (
    <QueryError
      error={reportQuery.error}
      fallback="Failed to load Search Console data"
      onRetry={() => void reportQuery.refetch()}
      isRetrying={reportQuery.isFetching}
    />
  );

  const filtersPanel = (
    <SearchPerformanceTextFilters
      // Remount on URL changes (back/forward) so the draft matches.
      key={JSON.stringify(textFilters)}
      value={textFilters}
      showQuery={isWeb}
      activeFilterCount={activeFilterCount}
      onApply={(filters) => {
        onSearchChange({
          page: undefined,
          pageText: filters.pageFilter?.expression,
          pageMatch: filters.pageFilter?.operator,
          queryText: filters.queryFilter?.expression,
          queryMatch: filters.queryFilter?.operator,
        });
      }}
      onReset={resetFilters}
    />
  );

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader
          title="Search Performance"
          description="See your site's clicks, impressions, CTR, and position from Google Search Console."
          actions={
            report?.connected ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/p/$projectId/settings/integrations"
                    params={{ projectId }}
                  />
                }
              >
                <ArrowLeftRight data-icon="inline-start" />
                Change property
              </Button>
            ) : null
          }
        />

        {reportQuery.isPending ? (
          <SearchPerformanceLoadingState />
        ) : !report ? (
          <>
            {filtersPanel}
            {reportError}
          </>
        ) : !report.connected ? (
          <div className="max-w-2xl">
            <GoogleConnectionCard
              provider="gsc"
              projectId={projectId}
              prominent
            />
          </div>
        ) : (
          <>
            {reportQuery.isError ? reportError : null}
            <SearchPerformanceOverview
              projectId={projectId}
              report={report}
              search={search}
              onSearchChange={onSearchChange}
              filterInput={filterInput}
              isWeb={isWeb}
              isFetching={reportQuery.isFetching}
              isPlaceholderData={reportQuery.isPlaceholderData}
              onSelect={setSelection}
            />
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <DataTableTabs
                value={tab}
                onValueChange={(value) => {
                  const nextTab = SEARCH_PERFORMANCE_TABS.find(
                    (item) => item === value,
                  );
                  if (nextTab)
                    onSearchChange({ tab: nextTab, page: undefined });
                }}
                actions={
                  <ExportMenu
                    actions={["sheets", "csv"]}
                    onExport={(target) => void handleExport(target)}
                    busy={isExporting}
                    disabled={reportQuery.isPlaceholderData}
                  />
                }
              >
                {isWeb ? (
                  <>
                    <TabsTrigger value="striking">
                      {reportQuery.isPlaceholderData
                        ? "Striking distance"
                        : `Striking distance (${report.strikingDistance.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="queries">Queries</TabsTrigger>
                  </>
                ) : null}
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </DataTableTabs>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                <Button
                  type="button"
                  variant={showFilters ? "secondary" : "ghost"}
                  size="sm"
                  aria-expanded={showFilters}
                  aria-controls="search-performance-filters"
                  onClick={() => setShowFilters((current) => !current)}
                  title="Toggle table filters"
                >
                  <SlidersHorizontal data-icon="inline-start" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <Badge size="sm">{activeFilterCount}</Badge>
                  ) : null}
                </Button>
              </div>

              {showFilters ? filtersPanel : null}
              {reportQuery.isPlaceholderData ? (
                <div className="p-8 text-sm" role="status">
                  Loading matching results…
                </div>
              ) : tab === "striking" ? (
                <StrikingDistanceTable
                  projectId={projectId}
                  rows={report.strikingDistance}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={(nextPage) =>
                    onSearchChange({ page: nextPage })
                  }
                  onPageSizeChange={(size) =>
                    onSearchChange({ page: undefined, size })
                  }
                  isFiltered={activeFilterCount > 0}
                  onClearFilters={resetFilters}
                />
              ) : (
                <DimensionSection
                  projectId={projectId}
                  tableQuery={tableQuery}
                  keyLabel={tab === "queries" ? "Query" : "Page"}
                  showPosition={isWeb}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={(nextPage) =>
                    onSearchChange({ page: nextPage })
                  }
                  onPageSizeChange={(size) =>
                    onSearchChange({ page: undefined, size })
                  }
                  isFiltered={activeFilterCount > 0}
                  onClearFilters={resetFilters}
                  selectedKey={
                    selection?.dimension === dimension ? selection.key : null
                  }
                  onSelect={(key) => setSelection({ dimension, key })}
                />
              )}
            </div>
            <SearchPerformanceDetailSheet
              projectId={projectId}
              selection={selection}
              filterInput={filterInput}
              isWeb={isWeb}
              periodLabel={DATE_RANGE_LABELS[range ?? "last_28_days"]}
              onClose={() => setSelection(null)}
            />
          </>
        )}
      </div>
    </div>
  );
}
