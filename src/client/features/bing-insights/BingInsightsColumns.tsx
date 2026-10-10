import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { safeHttpUrl } from "@/shared/safe-url";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import type {
  BingGroupBy,
  BingPerformanceRow,
} from "@/server/features/bing/bingPerformance";

const rightAligned = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

const helper = createColumnHelper<BingPerformanceRow>();

function keyLabel(groupBy: BingGroupBy): string {
  if (groupBy === "date") return "Date";
  if (groupBy === "page") return "Page";
  return "Query";
}

export function buildBingColumns(
  groupBy: BingGroupBy,
): ColumnDef<BingPerformanceRow>[] {
  const isPage = groupBy === "page";
  return [
    helper.accessor("key", {
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label={keyLabel(groupBy)}
          align="left"
        />
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        if (isPage) {
          const safeHref = safeHttpUrl(value);
          return (
            <a
              href={safeHref ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="block max-w-xl truncate text-primary underline-offset-4 hover:underline"
              title={value}
            >
              {value}
            </a>
          );
        }
        return (
          <span className="block max-w-xl truncate font-medium" title={value}>
            {value}
          </span>
        );
      },
    }),
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
      cell: ({ getValue }) => {
        const value = getValue();
        return value === undefined ? "—" : formatPosition(value);
      },
      meta: rightAligned,
    }),
  ];
}
