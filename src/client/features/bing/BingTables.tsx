import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  TableBulkActionBar,
  TableBulkActionButton,
} from "@/client/components/table/TableBulkActionBar";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { normalizeExportValue } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { SEARCH_PERFORMANCE_PAGE_SIZES } from "@/types/schemas/search-performance";
import {
  getBingPageQueries,
  type getBingQueryReport,
} from "@/serverFunctions/bing";
import { saveKeywords } from "@/serverFunctions/keywords";

export type BingQueryReport = Extract<
  Awaited<ReturnType<typeof getBingQueryReport>>,
  { connected: true }
>;
type BingAggregateRow = BingQueryReport["queries"][number];

const rightAligned = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

/** Bing's position can be null when no sampled row carried one. */
function formatNullablePosition(value: number | null): string {
  return value === null ? "–" : formatPosition(value);
}

const helper = createColumnHelper<BingAggregateRow>();

function metricColumns(): ColumnDef<BingAggregateRow>[] {
  return [
    helper.accessor("clicks", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Clicks" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    helper.accessor("impressions", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Impressions" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    helper.accessor("ctr", {
      header: ({ column }) => (
        <SortableHeader column={column} label="CTR" align="right" />
      ),
      cell: ({ getValue }) => formatCtr(getValue()),
      meta: rightAligned,
    }),
    helper.accessor("position", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Position" align="right" />
      ),
      cell: ({ getValue }) => formatNullablePosition(getValue()),
      meta: rightAligned,
    }),
  ];
}

function keyColumn(keyLabel: string): ColumnDef<BingAggregateRow> {
  const isPage = keyLabel === "Page";
  return helper.accessor("key", {
    enableSorting: false,
    header: () => keyLabel,
    // Bing page keys are URLs of the verified property; the scheme check is
    // defense-in-depth before rendering an href (queries never match it).
    cell: ({ getValue }) =>
      isPage && /^https?:\/\//.test(getValue()) ? (
        <a
          href={getValue()}
          target="_blank"
          rel="noreferrer"
          className="link link-hover block max-w-xl truncate"
          title={getValue()}
        >
          {getValue()}
        </a>
      ) : (
        <span className="block max-w-xl truncate" title={getValue()}>
          {getValue()}
        </span>
      ),
  });
}

/** Sortable whole-window queries or pages table, client-side pagination.
 *  `onDrillDown` adds a per-row action (used by the Pages tab to open the
 *  queries-for-this-page view). */
export function BingDimensionTable({
  rows,
  keyLabel,
  onDrillDown,
}: {
  rows: BingAggregateRow[];
  keyLabel: "Query" | "Page";
  onDrillDown?: (key: string) => void;
}) {
  const columns = useMemo(() => {
    const base = [keyColumn(keyLabel), ...metricColumns()];
    if (!onDrillDown) return base;
    return [
      ...base,
      helper.display({
        id: "drilldown",
        header: () => null,
        cell: ({ row }) => (
          <button
            type="button"
            className="btn btn-ghost btn-xs whitespace-nowrap"
            onClick={() => onDrillDown(row.original.key)}
          >
            Queries →
          </button>
        ),
      }),
    ];
  }, [keyLabel, onDrillDown]);
  const table = useAppTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    initialState: {
      sorting: [{ id: "clicks", desc: true }],
      pagination: { pageIndex: 0, pageSize: 50 },
    },
  });
  const pagination = table.getState().pagination;
  return (
    <>
      <AppDataTable
        table={table}
        className="table table-zebra table-sm"
        wrapperClassName="overflow-x-auto"
        empty={
          <p className="p-6 text-sm text-base-content/60">
            Bing hasn't sampled any rows for this site yet.
          </p>
        }
      />
      {rows.length > 0 ? (
        <TablePagination
          page={pagination.pageIndex + 1}
          pageSize={pagination.pageSize}
          pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
          totalCount={rows.length}
          hasNextPage={table.getCanNextPage()}
          isLoading={false}
          onPageChange={(nextPage) => table.setPageIndex(nextPage - 1)}
          onPageSizeChange={(nextSize) => table.setPageSize(nextSize)}
        />
      ) : null}
    </>
  );
}

/** Queries driving one page (GetPageQueryStats) — the drill-down opened from
 *  the Pages tab. Fetches on mount; same sampled-window aggregation as the
 *  site-wide tables. */
export function BingPageQueriesPanel({
  projectId,
  pageUrl,
  onBack,
}: {
  projectId: string;
  pageUrl: string;
  onBack: () => void;
}) {
  const query = useQuery({
    queryKey: ["bingPageQueries", projectId, pageUrl],
    queryFn: () => getBingPageQueries({ data: { projectId, pageUrl } }),
  });
  const rows = query.data?.connected ? query.data.queries : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-4 pb-0">
        <button type="button" className="btn btn-ghost btn-xs" onClick={onBack}>
          ← All pages
        </button>
        <span
          className="truncate font-mono text-sm text-base-content/70"
          title={pageUrl}
        >
          {pageUrl}
        </span>
      </div>
      {query.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Loading queries for this page…
        </div>
      ) : query.isError || (query.data && !query.data.connected) ? (
        <div className="space-y-3 p-6">
          <p className="text-sm text-error">
            Couldn't load queries for this page.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-base-content/60">
          Bing hasn't sampled any queries for this page yet.
        </p>
      ) : (
        <BingDimensionTable rows={rows} keyLabel="Query" />
      )}
    </>
  );
}

/** Striking-distance queries (position 5–20) with copy/save-as-keywords
 *  selection, modeled on the Search Console striking table minus the page
 *  column — Bing's GetQueryStats has no page dimension. */
export function BingStrikingTable({
  projectId,
  rows,
}: {
  projectId: string;
  rows: BingAggregateRow[];
}) {
  const queryClient = useQueryClient();
  const anchorRef = useSelectionAnchor();
  const [rowSelection, setRowSelection] = useState({});
  const columns = useMemo<ColumnDef<BingAggregateRow>[]>(
    () => [
      makeSelectionColumn<BingAggregateRow>(anchorRef),
      keyColumn("Query"),
      ...metricColumns(),
    ],
    [anchorRef],
  );
  const table = useAppTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.key,
    initialState: {
      sorting: [{ id: "impressions", desc: true }],
      pagination: { pageIndex: 0, pageSize: 50 },
    },
  });
  const pagination = table.getState().pagination;
  const selectedQueries = table
    .getSelectedRowModel()
    .rows.map((row) => row.original.key);

  const copyKeywords = async () => {
    try {
      // Sanitize against spreadsheet formula injection: Bing query strings are
      // untrusted and may begin with =, +, -, @, etc. See @/client/lib/csv.
      const text = selectedQueries
        .map((query) => normalizeExportValue(query))
        .join("\n");
      await navigator.clipboard.writeText(text);
      toast.success(
        `Copied ${selectedQueries.length} ${selectedQueries.length === 1 ? "keyword" : "keywords"}`,
      );
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const save = useMutation({
    mutationFn: (keywords: string[]) =>
      saveKeywords({ data: { projectId, keywords } }),
    onSuccess: (_result, keywords) => {
      captureClientEvent("keyword:save", {
        source_feature: "bing_performance",
        keyword_count: keywords.length,
      });
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      toast.success(
        `Saved ${keywords.length} ${keywords.length === 1 ? "keyword" : "keywords"}`,
      );
      setRowSelection({});
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Could not save keywords"));
    },
  });

  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-base-content/60">
        No striking-distance queries in Bing's sample. These are queries at
        average positions 5 to 20, where an improvement is most likely to move
        traffic.
      </p>
    );
  }

  return (
    <>
      <div className="p-4">
        <p className="mb-3 text-sm text-base-content/60">
          Queries at average positions 5 to 20, sorted by impressions. Improve
          the ranking pages to move them into the top results.
        </p>
        <AppDataTable
          table={table}
          className="table table-zebra table-sm"
          wrapperClassName="overflow-x-auto"
        />
      </div>
      <TablePagination
        page={pagination.pageIndex + 1}
        pageSize={pagination.pageSize}
        pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
        totalCount={rows.length}
        hasNextPage={table.getCanNextPage()}
        isLoading={false}
        onPageChange={(nextPage) => table.setPageIndex(nextPage - 1)}
        onPageSizeChange={(nextSize) => table.setPageSize(nextSize)}
      />
      <TableBulkActionBar
        selectedCount={selectedQueries.length}
        selectedLabel={selectedQueries.length === 1 ? "query" : "queries"}
        onClear={() => setRowSelection({})}
        actions={
          <div className="flex items-center gap-1 px-1.5">
            <TableBulkActionButton
              icon={<Copy className="size-3.5" />}
              onClick={() => void copyKeywords()}
            >
              Copy keywords
            </TableBulkActionButton>
            <TableBulkActionButton
              icon={
                save.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )
              }
              onClick={() => save.mutate(selectedQueries)}
              disabled={save.isPending}
            >
              Save as keywords
            </TableBulkActionButton>
          </div>
        }
      />
    </>
  );
}
