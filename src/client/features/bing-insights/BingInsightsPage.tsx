import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { QueryError } from "@/client/components/QueryState";
import { ExportMenu } from "@/client/components/ExportMenu";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Skeleton } from "@/client/components/ui/skeleton";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { BingConnectionCard } from "@/client/features/integrations/BingConnectionCard";
import { SearchPerformanceSourceToggle } from "@/client/features/search-performance/SearchPerformanceSourceToggle";
import { buildBingColumns } from "@/client/features/bing-insights/BingInsightsColumns";
import { formatCtr } from "@/client/features/search-performance/SearchPerformanceColumns";
import {
  BingFilterBar,
  BingSummary,
} from "@/client/features/bing-insights/BingInsightsParts";
import { exportRows } from "@/client/lib/exportRows";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getBingPerformance, getBingSummary } from "@/serverFunctions/bing";
import type {
  BingGroupBy,
  BingPerformanceRow,
} from "@/server/features/bing/bingPerformance";
import type { SearchPerformanceSource } from "@/types/schemas/search-performance";

const PAGE_SIZES = [25, 50, 100] as const;

/** Bing's query rows back both the striking-distance band and the Queries
 *  table, so they share one tab group; only Pages needs the page endpoint. */
const BING_TABS = ["striking", "queries", "pages"] as const;
type BingTab = (typeof BING_TABS)[number];

/** Which Bing dataset backs each tab: striking distance and queries share the
 *  query rows; only Pages needs the page endpoint. */
const BING_TAB_GROUP: Record<BingTab, BingGroupBy> = {
  striking: "query",
  queries: "query",
  pages: "page",
};

export function BingInsightsPage({
  projectId,
  source = "bing",
  onSourceChange,
}: {
  projectId: string;
  source?: SearchPerformanceSource;
  onSourceChange?: (source: SearchPerformanceSource) => void;
}) {
  const [tab, setTab] = useState<BingTab>("striking");
  // Striking distance is a view over the query rows, so both tabs share the
  // same request (and cache entry).
  const groupBy = BING_TAB_GROUP[tab];
  const [showFilters, setShowFilters] = useState(false);
  const [queryFilter, setQueryFilter] = useState("");
  const [minImpressions, setMinImpressions] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isExporting, setIsExporting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "impressions", desc: true },
  ]);

  const query = useQuery({
    queryKey: ["bingPerformance", projectId, groupBy],
    queryFn: () => getBingPerformance({ data: { projectId, groupBy } }),
  });
  const data = query.data;

  // The whole-site summary is its own request so the tiles paint as soon as
  // they land, independent of the (heavier) table rows.
  const summaryQuery = useQuery({
    queryKey: ["bingSummary", projectId],
    queryFn: () => getBingSummary({ data: { projectId } }),
  });
  const { connected, summary, trend, coverage, siteUrl } = readSummary(
    summaryQuery.data,
    data,
  );
  const bothPending = summaryQuery.isPending && query.isPending;

  const activeFilterCount =
    Number(queryFilter.trim().length > 0) +
    Number(minImpressions.trim().length > 0 && Number(minImpressions) > 0);

  const filteredRows = useMemo(() => {
    if (data?.connected !== true) return [];
    let list = tab === "striking" ? data.strikingDistance : data.rows;
    const q = queryFilter.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.key.toLowerCase().includes(q));
    }
    const min = Number(minImpressions);
    if (minImpressions.trim() !== "" && Number.isFinite(min) && min > 0) {
      list = list.filter((r) => r.impressions >= min);
    }
    return list;
  }, [data, tab, queryFilter, minImpressions]);

  const columns = useMemo(() => buildBingColumns(groupBy), [groupBy]);

  const table = useDataTable({
    data: filteredRows,
    columns,
    withSorting: true,
    withPagination: true,
    state: {
      sorting,
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
    },
    onSortingChange: setSorting,
  });

  const isFiltered = activeFilterCount > 0;
  const isPastEnd = page > 1 && table.getRowModel().rows.length === 0;

  const resetFilters = () => {
    setQueryFilter("");
    setMinImpressions("");
    setPage(1);
  };

  const handleExport = async (target: "csv" | "sheets") => {
    if (!data || !data.connected || isExporting) return;
    setIsExporting(true);
    try {
      const stamp = `${data.coverage.startDate ?? "start"}-to-${data.coverage.endDate ?? "end"}`;
      const keyHeader = tab === "pages" ? "Page" : "Query";
      await exportRows({
        format: target,
        feature: "search_performance",
        filename: `bing-performance-${groupBy}-${stamp}`,
        headers: [keyHeader, "Clicks", "Impressions", "CTR", "Position"],
        rows: filteredRows.map((r: BingPerformanceRow) => [
          r.key,
          r.clicks,
          r.impressions,
          formatCtr(r.ctr),
          r.position ?? "",
        ]),
      });
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Export failed"));
    } finally {
      setIsExporting(false);
    }
  };

  const header = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Search Performance</h1>
        <p className="text-sm text-muted-foreground">
          See your site&apos;s clicks, impressions, CTR, and position from Bing
          Webmaster Tools.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:mt-1">
        {data?.connected ? (
          <Link
            to="/p/$projectId/settings/integrations"
            params={{ projectId }}
            className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Change property
          </Link>
        ) : null}
        {onSourceChange ? (
          <SearchPerformanceSourceToggle
            value={source}
            onChange={onSourceChange}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        {header}

        {bothPending ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <SkeletonTableRows className="p-4" />
            </div>
          </div>
        ) : summaryQuery.isError || query.isError ? (
          <QueryError
            error={summaryQuery.error ?? query.error}
            fallback="Failed to load Bing data"
            onRetry={() => {
              void summaryQuery.refetch();
              void query.refetch();
            }}
            isRetrying={summaryQuery.isFetching || query.isFetching}
          />
        ) : !connected ? (
          <div className="max-w-2xl space-y-3">
            {summaryQuery.data?.requiresReconnect ||
            (data && !data.connected && data.requiresReconnect) ? (
              <p className="text-sm text-destructive">
                The Bing connection needs reconnecting — reconnect it below.
              </p>
            ) : null}
            <BingConnectionCard projectId={projectId} />
          </div>
        ) : (
          <>
            <BingSummary
              pending={summaryQuery.isPending}
              summary={summary}
              siteUrl={siteUrl}
              coverage={coverage}
              trend={trend}
            />

            {query.isPending ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <SkeletonTableRows className="p-4" />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <DataTableTabs
                  value={tab}
                  onValueChange={(val) => {
                    const next = BING_TABS.find((item) => item === val);
                    if (!next) return;
                    setTab(next);
                    setSorting(sortingForTab(next));
                    setPage(1);
                  }}
                  actions={
                    <ExportMenu
                      actions={["sheets", "csv"]}
                      onExport={(target) => void handleExport(target)}
                      busy={isExporting}
                      disabled={filteredRows.length === 0}
                    />
                  }
                >
                  <TabsTrigger value="striking">
                    {data?.connected
                      ? `Striking distance (${data.strikingDistance.length})`
                      : "Striking distance"}
                  </TabsTrigger>
                  <TabsTrigger value="queries">Queries</TabsTrigger>
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                </DataTableTabs>

                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                  <Button
                    type="button"
                    variant={showFilters ? "secondary" : "ghost"}
                    size="sm"
                    aria-expanded={showFilters}
                    onClick={() => setShowFilters((current) => !current)}
                    title="Toggle table filters"
                  >
                    <SlidersHorizontal data-icon="inline-start" />
                    Filters
                    {activeFilterCount > 0 ? (
                      <Badge size="sm">{activeFilterCount}</Badge>
                    ) : null}
                  </Button>
                  {query.isFetching && !query.isPending ? (
                    <Spinner className="size-4 text-muted-foreground" />
                  ) : null}
                </div>

                <BingFilterBar
                  showFilters={showFilters}
                  entity={tab === "pages" ? "pages" : "queries"}
                  queryFilter={queryFilter}
                  onQueryFilterChange={(val) => {
                    setQueryFilter(val);
                    setPage(1);
                  }}
                  minImpressions={minImpressions}
                  onMinImpressionsChange={(val) => {
                    setMinImpressions(val);
                    setPage(1);
                  }}
                  onClearFilters={resetFilters}
                  activeFilterCount={activeFilterCount}
                />

                <div className="p-4">
                  <DataTable
                    table={table}
                    isFiltered={isFiltered}
                    onClearFilters={resetFilters}
                    empty={bingEmptyState(isPastEnd, tab, () => setPage(1))}
                  />
                </div>

                {!isPastEnd && filteredRows.length > 0 && (
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    pageSizes={PAGE_SIZES}
                    totalCount={filteredRows.length}
                    hasNextPage={table.getCanNextPage()}
                    isLoading={query.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The table's empty state: past-the-end pagination, the striking-distance
 *  band, or Bing simply having no data yet. */
function bingEmptyState(
  isPastEnd: boolean,
  tab: BingTab,
  onGoToFirstPage: () => void,
) {
  if (isPastEnd) {
    return {
      title: "No rows on this page",
      description: "This page is past the end of the results.",
      action: (
        <Button variant="outline" size="sm" onClick={onGoToFirstPage}>
          Go to first page
        </Button>
      ),
    };
  }
  if (tab === "striking") {
    return {
      title: "No striking-distance queries",
      description: "Queries ranking at positions 5 to 20 will appear here.",
    };
  }
  return {
    title: "No Bing data found",
    description:
      "Bing data can take a few days to appear after a property is verified.",
  };
}

/** Striking distance ranks by impressions; the query and page tables by
 *  clicks. */
function sortingForTab(tab: BingTab): SortingState {
  return tab === "striking"
    ? [{ id: "impressions", desc: true }]
    : [{ id: "clicks", desc: true }];
}

/** The summary query is authoritative when it resolves; the rows query is the
 *  fallback, so the page paints correctly whichever lands first. */
function readSummary(
  summaryData: Awaited<ReturnType<typeof getBingSummary>> | undefined,
  rowsData: Awaited<ReturnType<typeof getBingPerformance>> | undefined,
) {
  const fromSummary = summaryData?.connected ? summaryData : undefined;
  const fromRows = rowsData?.connected ? rowsData : undefined;
  return {
    connected: Boolean(fromSummary || fromRows),
    summary: fromSummary?.summary ?? null,
    trend: fromSummary?.trend ?? [],
    coverage: fromSummary?.coverage ?? fromRows?.coverage,
    siteUrl: fromSummary?.siteUrl ?? fromRows?.siteUrl,
  };
}
