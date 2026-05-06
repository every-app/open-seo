import { useMemo } from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import {
  IntentBadge,
  SortHeader,
  type SortDir,
  type SortField,
} from "@/client/features/keywords/components";
import { formatNumber } from "@/client/features/keywords/utils";
import type { KeywordResearchRow } from "@/types/keywords";
import { EmptyFilterResults } from "./keywordResearchDesktopFilters";

type Props = {
  activeFilterCount: number;
  filteredRows: KeywordResearchRow[];
  overviewKeyword: KeywordResearchRow | null;
  selectedRows: Set<string>;
  setSelectedRows: (rows: Set<string>) => void;
  sortDir: SortDir;
  sortField: SortField;
  toggleSort: (field: SortField) => void;
  resetFilters: () => void;
  handleRowClick: (row: KeywordResearchRow) => void;
};

const keywordColumnHelper = createColumnHelper<KeywordResearchRow>();

export function KeywordResearchDesktopTable({
  activeFilterCount,
  filteredRows,
  overviewKeyword,
  selectedRows,
  setSelectedRows,
  sortDir,
  sortField,
  toggleSort,
  resetFilters,
  handleRowClick,
}: Props) {
  const selectAnchorRef = useSelectionAnchor();
  const rowSelection = useMemo<RowSelectionState>(
    () =>
      Object.fromEntries(
        [...selectedRows].map((keyword) => [keyword, true]),
      ) as RowSelectionState,
    [selectedRows],
  );
  const columns = useMemo<ColumnDef<KeywordResearchRow>[]>(
    () => [
      makeSelectionColumn<KeywordResearchRow>(selectAnchorRef),
      keywordColumnHelper.accessor("keyword", {
        header: () => (
          <SortHeader
            label="Keyword"
            field="keyword"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="min-w-0"
          />
        ),
        cell: ({ row }) => (
          <span
            className="block truncate font-medium capitalize"
            title={row.original.keyword}
          >
            {row.original.keyword}
          </span>
        ),
        meta: { cellClassName: "min-w-0" },
      }),
      keywordColumnHelper.accessor("searchVolume", {
        header: () => (
          <SortHeader
            label="Volume"
            field="searchVolume"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => formatNumber(getValue()),
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("cpc", {
        header: () => (
          <SortHeader
            label="CPC"
            helpText="Cost per click in USD."
            field="cpc"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : value.toFixed(2);
        },
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("competition", {
        header: () => (
          <SortHeader
            label="Comp."
            helpText="Advertiser competition."
            field="competition"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : value.toFixed(2);
        },
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("keywordDifficulty", {
        header: () => (
          <SortHeader
            label="Score"
            helpText="Keyword difficulty score."
            field="keywordDifficulty"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => <ScoreCell value={getValue()} />,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      }),
      keywordColumnHelper.accessor("intent", {
        header: "Intent",
        cell: ({ getValue }) => <IntentBadge intent={getValue()} />,
        meta: {
          headerClassName: "text-center",
          cellClassName: "text-center",
        },
      }),
    ],
    [selectAnchorRef, sortDir, sortField, toggleSort],
  );
  const table = useAppTable({
    data: filteredRows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setSelectedRows(
        new Set(
          Object.entries(next)
            .filter(([, selected]) => selected)
            .map(([keyword]) => keyword),
        ),
      );
    },
    getRowId: (row) => row.keyword,
    enableRowSelection: true,
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {filteredRows.length === 0 ? (
        <EmptyFilterResults
          activeFilterCount={activeFilterCount}
          resetFilters={resetFilters}
        />
      ) : (
        <AppDataTable
          table={table}
          className="table table-xs w-full"
          wrapperClassName="h-full overflow-y-auto"
          getRowProps={(row) => ({
            className: `cursor-pointer border-b border-base-200 hover:bg-base-200/50 ${
              overviewKeyword?.keyword === row.original.keyword
                ? "bg-primary/5 border-l-2 border-l-primary"
                : ""
            }`,
            onClick: () => handleRowClick(row.original),
          })}
        />
      )}
    </div>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return null;
  let tierClass = "bg-success/20 text-success";
  if (value > 60) tierClass = "bg-error/20 text-error";
  else if (value > 30) tierClass = "bg-warning/20 text-warning";
  return (
    <span
      className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${tierClass}`}
    >
      {value}
    </span>
  );
}
