import {
  createColumnHelper,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo } from "react";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { IntentBadge } from "@/client/features/keywords/components";
import type { KeywordIntent, SavedKeywordRow } from "@/types/keywords";
import { TagChip } from "./TagChip";
import {
  formatSavedKeywordDate,
  formatSavedKeywordNumber,
} from "./savedKeywordsUtils";

const columnHelper = createColumnHelper<SavedKeywordRow>();

export function SavedKeywordsTable({
  rows,
  rowSelection,
  sorting,
  isLoading,
  hasActiveFilters,
  onRowSelectionChange,
  onSortingChange,
}: {
  rows: SavedKeywordRow[];
  rowSelection: RowSelectionState;
  sorting: SortingState;
  isLoading: boolean;
  hasActiveFilters: boolean;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onSortingChange: OnChangeFn<SortingState>;
}) {
  const selectAnchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<SavedKeywordRow>[]>(
    () => [
      makeSelectionColumn<SavedKeywordRow>(selectAnchorRef),
      columnHelper.accessor("keyword", {
        header: ({ column }) => (
          <SortableHeader column={column} label="关键词" />
        ),
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue()}</span>
        ),
      }),
      columnHelper.accessor("searchVolume", {
        header: ({ column }) => (
          <SortableHeader column={column} label="搜索量" />
        ),
        cell: ({ getValue }) => formatSavedKeywordNumber(getValue()),
      }),
      columnHelper.accessor("cpc", {
        header: ({ column }) => <SortableHeader column={column} label="CPC" />,
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : `$${value.toFixed(2)}`;
        },
      }),
      columnHelper.accessor("competition", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="竞争度"
            helpText="Google Ads 付费搜索竞争度（0 到 1），数值越高表示参与竞价的广告主越多。"
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : value.toFixed(2);
        },
      }),
      columnHelper.accessor("keywordDifficulty", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="难度"
            helpText="自然搜索排名难度（0 到 100），数值越高表示进入 Google 前 10 名越难。"
          />
        ),
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
      }),
      columnHelper.accessor("intent", {
        header: () => "搜索意图",
        cell: ({ getValue }) => (
          <IntentBadge intent={normalizeIntent(getValue())} />
        ),
        enableSorting: false,
      }),
      columnHelper.display({
        id: "tags",
        header: () => "标签",
        cell: ({ row }) => <TagList tags={row.original.tags} />,
        enableSorting: false,
        meta: { cellClassName: "min-w-40 max-w-64" },
      }),
      columnHelper.accessor("fetchedAt", {
        header: ({ column }) => (
          <SortableHeader column={column} label="上次获取" />
        ),
        cell: ({ getValue }) => (
          <span className="text-xs text-base-content/55">
            {formatSavedKeywordDate(getValue())}
          </span>
        ),
      }),
    ],
    [selectAnchorRef],
  );
  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange,
    onSortingChange,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualSorting: true,
  });

  return (
    <AppDataTable
      table={table}
      className="table table-sm"
      isLoading={isLoading}
      loading={<SavedKeywordsSkeleton />}
      empty={<SavedKeywordsEmptyState hasActiveFilters={hasActiveFilters} />}
    />
  );
}

function normalizeIntent(value: string | null): KeywordIntent {
  switch (value) {
    case "informational":
    case "commercial":
    case "transactional":
    case "navigational":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function TagList({ tags }: { tags: SavedKeywordRow["tags"] }) {
  if (tags.length === 0) {
    return <span className="text-base-content/35">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} size="xs" />
      ))}
    </div>
  );
}

function SavedKeywordsSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="skeleton h-4 w-48" />
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid grid-cols-9 items-center gap-3">
          <div className="skeleton h-4" />
          <div className="skeleton col-span-2 h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
        </div>
      ))}
    </div>
  );
}

function SavedKeywordsEmptyState({
  hasActiveFilters,
}: {
  hasActiveFilters: boolean;
}) {
  return (
    <div className="py-12 text-center text-sm text-base-content/55">
      <Search className="mx-auto mb-2 size-8 opacity-40" />
      <p>
        {hasActiveFilters
          ? "没有已保存关键词符合当前筛选条件。"
          : "暂无已保存关键词。可前往“关键词研究”页面查找并保存。"}
      </p>
    </div>
  );
}
