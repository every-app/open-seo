import { createColumnHelper, type Table } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { AppDataTable } from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { numericNullsLast } from "@/client/components/table/nullSafeSort";
import {
  formatCount,
  formatPlatformLabel,
} from "@/client/features/ai-search/platformLabels";
import { formatUrlForDisplay } from "@/client/components/table/url";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type TopPageRow = BrandLookupResult["topPages"][number];
type TopQueryRow = BrandLookupResult["topQueries"][number];
type PlatformKey = TopPageRow["platform"];

const PLATFORM_BADGE_CLASS: Record<PlatformKey, string> = {
  chat_gpt: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  google: "border-sky-500/40 bg-sky-500/10 text-sky-500",
};

function PlatformBadge({ platform }: { platform: PlatformKey }) {
  return (
    <span className={`badge badge-sm border ${PLATFORM_BADGE_CLASS[platform]}`}>
      {formatPlatformLabel(platform)}
    </span>
  );
}

const pagesHelper = createColumnHelper<TopPageRow>();
const queriesHelper = createColumnHelper<TopQueryRow>();

export const topPagesColumns = [
  pagesHelper.accessor("url", {
    id: "url",
    header: () => <span className="uppercase tracking-wider">URL</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <a
          href={row.original.url}
          target="_blank"
          rel="noreferrer"
          className="link link-primary inline-flex items-start gap-1 break-all"
        >
          <span className="break-all">
            {formatUrlForDisplay(row.original.url)}
          </span>
          <ExternalLink className="mt-1 size-3 shrink-0" />
        </a>
        {row.original.domain ? (
          <p className="text-xs text-base-content/50">{row.original.domain}</p>
        ) : null}
      </>
    ),
  }),
  pagesHelper.accessor("platform", {
    id: "platform",
    header: () => <span className="uppercase tracking-wider">Platform</span>,
    enableSorting: false,
    cell: ({ getValue }) => <PlatformBadge platform={getValue()} />,
  }),
  pagesHelper.accessor("mentions", {
    id: "mentions",
    header: ({ column }) => (
      <SortableHeader column={column} label="Mentions" align="right" />
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums">{formatCount(getValue())}</span>
    ),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
];

export const topQueriesColumns = [
  queriesHelper.accessor("question", {
    id: "question",
    header: () => <span className="uppercase tracking-wider">Query</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <p className="break-words font-medium">{row.original.question}</p>
        {row.original.brandsMentioned.length > 0 ? (
          <p className="mt-0.5 text-xs text-base-content/50">
            Brands: {row.original.brandsMentioned.slice(0, 5).join(", ")}
          </p>
        ) : null}
      </>
    ),
  }),
  queriesHelper.accessor("platform", {
    id: "platform",
    header: () => <span className="uppercase tracking-wider">Platform</span>,
    enableSorting: false,
    cell: ({ getValue }) => <PlatformBadge platform={getValue()} />,
  }),
  queriesHelper.accessor("aiSearchVolume", {
    id: "aiSearchVolume",
    header: ({ column }) => (
      <SortableHeader column={column} label="AI search vol." align="right" />
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums">{formatCount(getValue())}</span>
    ),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
];

export function TopPagesTable({ table }: { table: Table<TopPageRow> }) {
  if (table.getRowModel().rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-base-content/60">
        No cited pages returned.
      </p>
    );
  }

  return <BrandLookupTable table={table} urlLikeColumnId="url" />;
}

export function TopQueriesTable({ table }: { table: Table<TopQueryRow> }) {
  if (table.getRowModel().rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-base-content/60">
        No matching queries found.
      </p>
    );
  }

  return <BrandLookupTable table={table} urlLikeColumnId="question" />;
}

function BrandLookupTable<T>({
  table,
  urlLikeColumnId,
}: {
  table: Table<T>;
  urlLikeColumnId: string;
}) {
  return (
    <AppDataTable
      table={table}
      getCellClassName={(_, columnId) =>
        cellClassName(
          columnId,
          urlLikeColumnId,
          table.getColumn(columnId)?.getCanSort() ?? false,
        )
      }
      getRowClassName={() => ""}
    />
  );
}

function cellClassName(
  columnId: string,
  urlLikeColumnId: string,
  isNumeric: boolean,
): string {
  if (columnId === urlLikeColumnId) {
    return "min-w-80 max-w-2xl align-top";
  }
  if (isNumeric) {
    return "whitespace-nowrap text-right align-top";
  }
  return "whitespace-nowrap align-top";
}
