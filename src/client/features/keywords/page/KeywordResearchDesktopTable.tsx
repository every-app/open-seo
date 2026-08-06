import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { formatNumber } from "@/client/features/keywords/utils";
import type { KeywordResearchRow } from "@/types/keywords";
import { EmptyFilterResults } from "./keywordResearchFilters";

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
  const { t } = useTranslation();
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
            label={t("keywordResearch.columns.keyword")}
            field="keyword"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="min-w-48 md:min-w-0"
          />
        ),
        cell: ({ row }) => (
          <span
            className="block min-w-48 whitespace-normal break-words font-medium capitalize md:min-w-0 md:truncate"
            title={row.original.keyword}
          >
            {row.original.keyword}
          </span>
        ),
        meta: {
          headerClassName: "min-w-48 md:min-w-0",
          cellClassName: "min-w-48 md:min-w-0",
        },
      }),
      keywordColumnHelper.accessor("searchVolume", {
        header: () => (
          <SortHeader
            label={t("keywordResearch.columns.volume")}
            helpText={t("keywordResearch.columns.volumeHelp")}
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
          cellClassName:
            "whitespace-nowrap text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("cpc", {
        header: () => (
          <SortHeader
            label={t("keywordResearch.columns.cpc")}
            helpText={t("keywordResearch.columns.cpcHelp")}
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
          cellClassName:
            "whitespace-nowrap text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("competition", {
        header: () => (
          <SortHeader
            label={t("keywordResearch.columns.comp")}
            helpText={t("keywordResearch.columns.compHelp")}
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
          cellClassName:
            "whitespace-nowrap text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("keywordDifficulty", {
        header: () => (
          <SortHeader
            label={t("keywordResearch.columns.score")}
            helpText={t("keywordResearch.columns.scoreHelp")}
            field="keywordDifficulty"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      }),
      keywordColumnHelper.accessor("intent", {
        header: () => (
          <span title={t("keywordResearch.columns.intentHelp")}>
            {t("keywordResearch.columns.intent")}
          </span>
        ),
        cell: ({ getValue }) => <IntentBadge intent={getValue()} />,
        meta: {
          headerClassName: "text-center",
          cellClassName: "whitespace-nowrap text-center",
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
    <div className="flex-1 min-h-0">
      {filteredRows.length === 0 ? (
        <EmptyFilterResults
          activeFilterCount={activeFilterCount}
          resetFilters={resetFilters}
        />
      ) : (
        <AppDataTable
          table={table}
          className="table table-xs min-w-max md:w-full"
          wrapperClassName="h-full overflow-auto"
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
