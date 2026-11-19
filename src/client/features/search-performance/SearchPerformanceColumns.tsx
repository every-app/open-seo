import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { MutableRefObject } from "react";
import { makeSelectionColumn } from "@/client/components/table/DataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { safeHttpUrl } from "@/shared/safe-url";
import type { SelectionAnchor } from "@/client/components/table/tableSelection";
import type {
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";

export type Report = Extract<
  Awaited<ReturnType<typeof getSearchPerformanceReport>>,
  { connected: true }
>;
export type SearchPerformanceTableRow = Extract<
  Awaited<ReturnType<typeof getSearchPerformanceTable>>,
  { connected: true }
>["rows"][number];
type DimensionRow = SearchPerformanceTableRow;
type StrikingRow = Report["strikingDistance"][number];

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function formatCtr(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPosition(value: number): string {
  return value.toFixed(1);
}

// The --success and --destructive tokens are too light for small text on a
// white card.
export function changeClass(improved: boolean): string {
  return improved
    ? "text-green-700 dark:text-success"
    : "text-red-700 dark:text-destructive";
}

/** A change in clicks with its sign, for example +137 or −21. */
export function formatClickChange(change: number): string {
  return `${change >= 0 ? "+" : "−"}${formatCount(Math.abs(change))}`;
}

const rightAligned = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

const dimensionHelper = createColumnHelper<DimensionRow>();

export function buildDimensionColumns(
  keyLabel: string,
  showPosition: boolean,
): ColumnDef<DimensionRow>[] {
  const columns: ColumnDef<DimensionRow>[] = [
    dimensionHelper.accessor("key", {
      enableSorting: false,
      header: () => keyLabel,
      // A button, so the keyboard can open the row's details too. Its click
      // bubbles to the row, which is what opens them.
      cell: ({ getValue }) => (
        <button
          type="button"
          className="block max-w-xl cursor-pointer truncate rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          title={getValue()}
        >
          {getValue()}
        </button>
      ),
    }),
    dimensionHelper.accessor("clicks", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Clicks" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    // Against the previous period. Unknown when the row was outside that
    // period's top rows, so it sorts last.
    dimensionHelper.accessor(
      (row) =>
        row.prevClicks === null ? undefined : row.clicks - row.prevClicks,
      {
        id: "change",
        sortUndefined: "last",
        header: ({ column }) => (
          <SortableHeader column={column} label="Change" align="right" />
        ),
        cell: ({ getValue }) => {
          const change = getValue();
          if (change === undefined)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={change === 0 ? undefined : changeClass(change > 0)}
            >
              {formatClickChange(change)}
            </span>
          );
        },
        meta: rightAligned,
      },
    ),
    dimensionHelper.accessor("impressions", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Impressions" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    dimensionHelper.accessor("ctr", {
      header: ({ column }) => (
        <SortableHeader column={column} label="CTR" align="right" />
      ),
      cell: ({ getValue }) => formatCtr(getValue()),
      meta: rightAligned,
    }),
  ];
  if (!showPosition) return columns;
  return [
    ...columns,
    dimensionHelper.accessor("position", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Position" align="right" />
      ),
      cell: ({ getValue }) => formatPosition(getValue()),
      meta: rightAligned,
    }),
  ];
}

const strikingHelper = createColumnHelper<StrikingRow>();

export function buildStrikingColumns(
  anchorRef: MutableRefObject<SelectionAnchor | null>,
): ColumnDef<StrikingRow>[] {
  return [
    makeSelectionColumn<StrikingRow>(anchorRef),
    strikingHelper.accessor("query", {
      enableSorting: false,
      header: () => "Query",
      cell: ({ getValue }) => (
        <span className="block max-w-xs truncate" title={getValue()}>
          {getValue()}
        </span>
      ),
    }),
    strikingHelper.accessor("page", {
      enableSorting: false,
      header: () => "Page",
      // GSC page keys are canonical http(s) URLs of the verified property;
      // the scheme check is defense-in-depth before rendering an href.
      cell: ({ getValue }) => (
        <a
          href={safeHttpUrl(getValue()) ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="block max-w-sm truncate text-primary underline-offset-4 hover:underline"
          title={getValue()}
        >
          {getValue()}
        </a>
      ),
    }),
    strikingHelper.accessor("impressions", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Impressions" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    strikingHelper.accessor("clicks", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Clicks" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    strikingHelper.accessor("position", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Position" align="right" />
      ),
      cell: ({ getValue }) => formatPosition(getValue()),
      meta: rightAligned,
    }),
  ];
}
