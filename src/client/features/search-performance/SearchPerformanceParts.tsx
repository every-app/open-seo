import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  DataTable,
  useDataTable,
  useSelectionAnchor,
} from "@/client/components/table/DataTable";
import {
  TableBulkActionBar,
  TableBulkActionButton,
} from "@/client/components/table/TableBulkActionBar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { Button } from "@/client/components/ui/button";
import {
  buildDimensionColumns,
  buildStrikingColumns,
  type Report,
  type SearchPerformanceTableRow,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { normalizeExportValue, type CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  SEARCH_PERFORMANCE_PAGE_SIZES,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";
import { saveKeywords } from "@/serverFunctions/keywords";
import { TrackRankingsMenu } from "./TrackRankingsMenu";

export type ExportTarget = "csv" | "sheets";

type ExportTable = { filename: string; headers: string[]; rows: CsvValue[][] };

function strikingExportTable(report: Report): ExportTable {
  const stamp = `${report.range.startDate}-to-${report.range.endDate}`;
  return {
    filename: `search-performance-striking-distance-${stamp}`,
    headers: ["Query", "Page", "Impressions", "Clicks", "Position"],
    rows: report.strikingDistance.map((row) => [
      row.query,
      row.page,
      row.impressions,
      row.clicks,
      row.position,
    ]),
  };
}

type ExportRow = Omit<SearchPerformanceTableRow, "prevClicks">;

function dimensionExportTable(
  dimension: SearchPerformanceTableDimension,
  rows: ExportRow[],
  stamp: string,
  showPosition: boolean,
): ExportTable {
  const isPage = dimension === "page";
  return {
    filename: `search-performance-${isPage ? "pages" : "queries"}-${stamp}`,
    headers: [
      isPage ? "Page" : "Query",
      "Clicks",
      "Impressions",
      "CTR (%)",
      ...(showPosition ? ["Position"] : []),
    ],
    rows: rows.map((row) => [
      row.key,
      row.clicks,
      row.impressions,
      // CTR is a 0-1 ratio; exports keep two decimals, which would turn 0.0234
      // into 0.02. As a percentage the same precision reads 2.34.
      Math.round(row.ctr * 10_000) / 100,
      ...(showPosition ? [row.position] : []),
    ]),
  };
}

function runExport(table: ExportTable, target: ExportTarget): Promise<void> {
  return exportRows({
    format: target,
    feature: "search_performance",
    ...table,
  });
}

export function exportStriking(
  report: Report,
  target: ExportTarget,
): Promise<void> {
  return runExport(strikingExportTable(report), target);
}

/** Export the full queries/pages dataset (fetched separately, not the visible
 *  page) so pagination never truncates a download. */
export function exportDimensionRows(
  dimension: SearchPerformanceTableDimension,
  rows: ExportRow[],
  range: Report["range"],
  target: ExportTarget,
  showPosition: boolean,
): Promise<void> {
  const stamp = `${range.startDate}-to-${range.endDate}`;
  return runExport(
    dimensionExportTable(dimension, rows, stamp, showPosition),
    target,
  );
}

export function DimensionTable({
  rows,
  keyLabel,
  showPosition,
  isFiltered,
  isPastEnd,
  onClearFilters,
  onFirstPage,
  selectedKey,
  onSelect,
}: {
  rows: SearchPerformanceTableRow[];
  keyLabel: string;
  showPosition: boolean;
  isFiltered: boolean;
  isPastEnd: boolean;
  onClearFilters: () => void;
  onFirstPage: () => void;
  /** The row whose details are open. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const columns = useMemo(
    () => buildDimensionColumns(keyLabel, showPosition),
    [keyLabel, showPosition],
  );
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    getRowId: (row) => row.key,
    initialState: { sorting: [{ id: "clicks", desc: true }] },
  });
  return (
    <DataTable
      table={table}
      onRowClick={(row) => onSelect(row.original.key)}
      activeRowId={selectedKey ?? undefined}
      isFiltered={isFiltered && !isPastEnd}
      onClearFilters={onClearFilters}
      empty={
        isPastEnd
          ? {
              title: "No rows on this page",
              description: "This page is past the end of the results.",
              action: (
                <Button variant="outline" size="sm" onClick={onFirstPage}>
                  Go to first page
                </Button>
              ),
            }
          : {
              title: "No Search Console data yet",
              description: "Search Console data can take a few days to appear.",
            }
      }
    />
  );
}

/** Saves Search Console queries to the project's saved keywords. */
export function useSaveQueriesAsKeywords(
  projectId: string,
  onSaved?: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keywords: string[]) =>
      saveKeywords({ data: { projectId, keywords } }),
    onSuccess: (_result, keywords) => {
      captureClientEvent("keyword:save", {
        source_feature: "search_performance",
        keyword_count: keywords.length,
      });
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      toast.success(
        `Saved ${keywords.length} ${keywords.length === 1 ? "keyword" : "keywords"}`,
      );
      onSaved?.();
    },
  });
}

export function StrikingDistanceTable({
  projectId,
  rows,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isFiltered,
  onClearFilters,
}: {
  projectId: string;
  rows: Report["strikingDistance"];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  const anchorRef = useSelectionAnchor();
  const [rowSelection, setRowSelection] = useState({});
  const columns = useMemo(() => buildStrikingColumns(anchorRef), [anchorRef]);
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    enableRowSelection: true,
    state: { rowSelection, pagination: { pageIndex: page - 1, pageSize } },
    onRowSelectionChange: setRowSelection,
    // The server collapses each query to its top page, so queries are unique.
    getRowId: (row) => row.query,
    initialState: {
      sorting: [{ id: "impressions", desc: true }],
    },
  });
  const isPastEnd = page > 1 && table.getRowModel().rows.length === 0;

  const selectedQueries = table
    .getSelectedRowModel()
    .rows.map((row) => row.original.query);

  const copyKeywords = async () => {
    try {
      // Sanitize against spreadsheet formula injection: GSC query strings are
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

  const save = useSaveQueriesAsKeywords(projectId, () => setRowSelection({}));

  return (
    <>
      <div className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Queries ranking at positions 5 to 20, sorted by impressions. Improve
          the listed page to move them into the top results.
        </p>
        <DataTable
          table={table}
          isFiltered={isFiltered && !isPastEnd}
          onClearFilters={onClearFilters}
          empty={
            isPastEnd
              ? {
                  title: "No rows on this page",
                  description: "This page is past the end of the results.",
                  action: (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPageChange(1)}
                    >
                      Go to first page
                    </Button>
                  ),
                }
              : {
                  title: "No striking-distance queries",
                  description:
                    "Queries ranking at positions 5 to 20 will appear here.",
                }
          }
        />
      </div>
      {!isPastEnd && rows.length > 0 && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
          totalCount={rows.length}
          hasNextPage={table.getCanNextPage()}
          isLoading={false}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
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
            <TrackRankingsMenu
              projectId={projectId}
              queries={selectedQueries}
              onAdded={() => setRowSelection({})}
            />
          </div>
        }
      />
    </>
  );
}
