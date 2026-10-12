import { useMemo, useState, type ReactNode } from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  extractPathname,
  LighthouseScoreBadge,
} from "@/client/features/audit/shared";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import {
  countActiveFilters,
  PerformanceFilterBar,
  ResultsTableToolbar,
} from "@/client/features/audit/results/AuditResultsTableFilters";
import {
  EMPTY_PERFORMANCE_FILTERS,
  filterPerformanceRows,
  isLighthouseFailure,
  nullableNumberSort,
  nullableStringSort,
  type PerformanceFilters,
  type PerformanceRowData,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";

const performanceColumnHelper = createColumnHelper<PerformanceRowData>();

export function PerformanceTable({
  auditId,
  projectId,
  lighthouse,
  pages,
  tabs,
}: {
  auditId: string;
  projectId: string;
  lighthouse: AuditResultsData["lighthouse"];
  pages: AuditResultsData["pages"];
  tabs: ReactNode;
}) {
  const [filters, setFilters] = useState<PerformanceFilters>(
    EMPTY_PERFORMANCE_FILTERS,
  );
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "performanceScore", desc: false },
  ]);
  const rows = useMemo(
    () =>
      lighthouse.map((result) => {
        const page = pages.find((candidate) => candidate.id === result.pageId);
        const pageUrl = page?.url ?? null;
        return {
          ...result,
          pageUrl,
          pagePath: pageUrl ? extractPathname(pageUrl) : null,
        };
      }),
    [lighthouse, pages],
  );
  const filteredRows = useMemo(
    () => filterPerformanceRows(rows, filters),
    [filters, rows],
  );
  const activeFilterCount = countActiveFilters(
    filters,
    EMPTY_PERFORMANCE_FILTERS,
  );
  const columns = useMemo(
    () => buildPerformanceColumns({ auditId, projectId }),
    [auditId, projectId],
  );
  const table = useDataTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    withSorting: true,
  });

  const resetFilters = () => setFilters(EMPTY_PERFORMANCE_FILTERS);

  return (
    <DataTable
      table={table}
      empty={{ title: "No Lighthouse results" }}
      isFiltered={activeFilterCount > 0}
      onClearFilters={resetFilters}
      toolbar={
        <>
          {tabs}
          <ResultsTableToolbar
            showFilters={showFilters}
            onToggle={() => setShowFilters((current) => !current)}
            activeFilterCount={activeFilterCount}
            resultCount={filteredRows.length}
            totalCount={rows.length}
          />
          {showFilters ? (
            <PerformanceFilterBar
              filters={filters}
              onChange={setFilters}
              activeFilterCount={activeFilterCount}
              onReset={resetFilters}
            />
          ) : null}
        </>
      }
    />
  );
}

function buildPerformanceColumns({
  auditId,
  projectId,
}: {
  auditId: string;
  projectId: string;
}): ColumnDef<PerformanceRowData>[] {
  return [
    performanceColumnHelper.accessor("pagePath", {
      header: ({ column }) => <SortableHeader column={column} label="URL" />,
      cell: ({ getValue }) => (
        <span className="text-xs">{getValue() ?? "-"}</span>
      ),
      sortingFn: nullableStringSort,
      meta: { cellClassName: "max-w-[180px] truncate" },
    }),
    performanceColumnHelper.accessor("strategy", {
      header: ({ column }) => <SortableHeader column={column} label="Device" />,
      cell: ({ getValue }) => (
        <span className="capitalize text-xs">{getValue()}</span>
      ),
    }),
    performanceColumnHelper.display({
      id: "status",
      header: ({ column }) => <SortableHeader column={column} label="Status" />,
      cell: ({ row }) => {
        const isFailed = isLighthouseFailure(row.original);
        const failureMessage =
          row.original.errorMessage ?? "Lighthouse returned no category scores";
        return isFailed ? (
          <Badge variant="destructive" title={failureMessage}>
            failed
          </Badge>
        ) : (
          <Badge variant="success">ok</Badge>
        );
      },
      enableSorting: true,
      sortingFn: (left, right) =>
        Number(isLighthouseFailure(left.original)) -
        Number(isLighthouseFailure(right.original)),
    }),
    performanceColumnHelper.accessor("performanceScore", {
      header: ({ column }) => <SortableHeader column={column} label="Perf" />,
      cell: ({ getValue }) => <LighthouseScoreBadge score={getValue()} />,
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.accessor("accessibilityScore", {
      header: ({ column }) => <SortableHeader column={column} label="A11y" />,
      cell: ({ getValue }) => <LighthouseScoreBadge score={getValue()} />,
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.accessor("seoScore", {
      header: ({ column }) => <SortableHeader column={column} label="SEO" />,
      cell: ({ getValue }) => <LighthouseScoreBadge score={getValue()} />,
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.accessor("lcpMs", {
      header: ({ column }) => <SortableHeader column={column} label="LCP" />,
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? (
          <span className="text-xs">{(value / 1000).toFixed(1)}s</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.accessor("cls", {
      header: ({ column }) => <SortableHeader column={column} label="CLS" />,
      cell: ({ getValue }) => {
        const value = getValue();
        return value != null ? (
          <span className="text-xs">{value.toFixed(3)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.accessor("inpMs", {
      header: ({ column }) => <SortableHeader column={column} label="INP" />,
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? (
          <span className="text-xs">{Math.round(value)}ms</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.accessor("ttfbMs", {
      header: ({ column }) => <SortableHeader column={column} label="TTFB" />,
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? (
          <span className="text-xs">{Math.round(value)}ms</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.display({
      id: "issues",
      header: () => "Issues",
      cell: ({ row }) =>
        row.original.r2Key && !isLighthouseFailure(row.original) ? (
          <Button
            size="xs"
            nativeButton={false}
            render={
              <Link
                to="/p/$projectId/audit/issues/$resultId"
                params={{ projectId, resultId: row.original.id }}
                search={{ auditId, category: "performance" }}
              />
            }
          >
            View issues
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    }),
  ];
}
