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
import { ExternalUrlCell } from "@/client/components/table/url";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { SortableHeader } from "@/client/features/domain/components/SortableHeader";
import { formatFloat, formatNumber } from "@/client/features/domain/utils";
import type {
  DomainSortMode,
  KeywordRow,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  domain: string;
  rows: KeywordRow[];
  selectedKeywords: Set<string>;
  visibleKeywords: string[];
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  onSortClick: (sort: DomainSortMode) => void;
  onToggleKeyword: (keyword: string) => void;
};

const keywordColumnHelper = createColumnHelper<KeywordRow>();

export function DomainKeywordsTable({
  domain,
  rows,
  selectedKeywords,
  visibleKeywords,
  sortMode,
  currentSortOrder,
  onSortClick,
  onToggleKeyword,
}: Props) {
  const selectAnchorRef = useSelectionAnchor();
  const rowSelection = useMemo<RowSelectionState>(
    () =>
      Object.fromEntries(
        [...selectedKeywords].map((keyword) => [keyword, true]),
      ) as RowSelectionState,
    [selectedKeywords],
  );
  const columns = useMemo<ColumnDef<KeywordRow>[]>(
    () => [
      makeSelectionColumn<KeywordRow>(selectAnchorRef),
      keywordColumnHelper.accessor("keyword", {
        header: () => "Keyword",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue()}</span>
        ),
      }),
      keywordColumnHelper.accessor("position", {
        header: () => (
          <SortableHeader
            label="Rank"
            isActive={sortMode === "rank"}
            order={currentSortOrder}
            onClick={() => onSortClick("rank")}
          />
        ),
        cell: ({ getValue }) => getValue() ?? "-",
      }),
      keywordColumnHelper.accessor("searchVolume", {
        header: () => (
          <SortableHeader
            label="Volume"
            isActive={sortMode === "volume"}
            order={currentSortOrder}
            onClick={() => onSortClick("volume")}
          />
        ),
        cell: ({ getValue }) => formatNumber(getValue()),
      }),
      keywordColumnHelper.accessor("traffic", {
        header: () => (
          <SortableHeader
            label="Traffic"
            isActive={sortMode === "traffic"}
            order={currentSortOrder}
            onClick={() => onSortClick("traffic")}
          />
        ),
        cell: ({ getValue }) => formatFloat(getValue()),
      }),
      keywordColumnHelper.accessor("cpc", {
        header: () => (
          <SortableHeader
            label="CPC"
            helpText="Cost per click in USD."
            isActive={sortMode === "cpc"}
            order={currentSortOrder}
            onClick={() => onSortClick("cpc")}
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : `$${value.toFixed(2)}`;
        },
      }),
      keywordColumnHelper.display({
        id: "url",
        header: () => "URL",
        cell: ({ row }) => (
          <ExternalUrlCell
            value={row.original.relativeUrl ?? row.original.url}
            label={row.original.relativeUrl ?? row.original.url ?? ""}
            baseDomain={domain}
          />
        ),
        meta: {
          cellClassName: "max-w-[260px] truncate",
        },
      }),
      keywordColumnHelper.accessor("keywordDifficulty", {
        header: () => (
          <SortableHeader
            label="Score"
            helpText="Keyword difficulty score."
            isActive={sortMode === "score"}
            order={currentSortOrder}
            onClick={() => onSortClick("score")}
          />
        ),
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
      }),
    ],
    [currentSortOrder, domain, onSortClick, selectAnchorRef, sortMode],
  );
  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      const selected = Object.entries(next)
        .filter(([, value]) => value)
        .map(([keyword]) => keyword);
      for (const keyword of visibleKeywords) {
        const shouldBeSelected = selected.includes(keyword);
        if (selectedKeywords.has(keyword) !== shouldBeSelected) {
          onToggleKeyword(keyword);
        }
      }
    },
    getRowId: (row) => row.keyword,
    enableRowSelection: true,
  });

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 text-xs text-base-content/60">
        {selectedKeywords.size > 0
          ? `${selectedKeywords.size} selected`
          : "Select keywords to save"}
      </div>
      <AppDataTable
        table={table}
        className="table table-zebra table-sm"
        wrapperClassName=""
        empty={
          <div className="py-6 text-center text-base-content/60">
            No keywords match this search.
          </div>
        }
      />
    </div>
  );
}
