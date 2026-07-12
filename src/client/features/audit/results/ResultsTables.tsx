import { useMemo, useState } from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  extractPathname,
  LighthouseScoreBadge,
} from "@/client/features/audit/shared";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import {
  countActiveFilters,
  EmptyTableMessage,
  PerformanceFilterBar,
  TableFilterToggle,
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
}: {
  auditId: string;
  projectId: string;
  lighthouse: AuditResultsData["lighthouse"];
  pages: AuditResultsData["pages"];
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
  const table = useAppTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    withSorting: true,
  });

  return (
    <div className="space-y-3">
      <TableFilterToggle
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
          onReset={() => setFilters(EMPTY_PERFORMANCE_FILTERS)}
        />
      ) : null}
      <AppDataTable
        table={table}
        className="table table-sm"
        empty={
          <EmptyTableMessage label="No performance results match these filters." />
        }
      />
    </div>
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
          <span
            className="badge badge-error badge-outline text-xs"
            title={failureMessage}
          >
            failed
          </span>
        ) : (
          <span className="badge badge-success badge-outline text-xs">ok</span>
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
          <span className="text-xs text-base-content/40">-</span>
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
          <span className="text-xs text-base-content/40">-</span>
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
          <span className="text-xs text-base-content/40">-</span>
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
          <span className="text-xs text-base-content/40">-</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
    performanceColumnHelper.display({
      id: "issues",
      header: () => "Issues",
      cell: ({ row }) =>
        row.original.r2Key && !isLighthouseFailure(row.original) ? (
          <Link
            className="btn btn-primary btn-xs"
            to="/p/$projectId/audit/issues/$resultId"
            params={{ projectId, resultId: row.original.id }}
            search={{ auditId, category: "performance" }}
          >
            View issues
          </Link>
        ) : (
          <span className="text-xs text-base-content/40">-</span>
        ),
    }),
  ];
}

export function ExportDropdown({
  onExport,
}: {
  onExport: (format: "csv" | "json" | "sheets") => void;
}) {
  return (
    <TableExportMenu
      buttonClassName="btn btn-sm btn-ghost gap-1"
      menuClassName="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-52"
      actions={[
        { label: "Export to Sheets", onClick: () => onExport("sheets") },
        { label: "CSV", onClick: () => onExport("csv") },
        { label: "JSON", onClick: () => onExport("json") },
      ]}
    />
  );
}
