import { useMemo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { ColumnDef, SortingFn } from "@tanstack/react-table";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import { comparePositions, DeviceRankCell } from "./RankTrackingTableParts";

const HEADER_TOOLTIPS: Record<string, string> = {
  keyword: "The search term being tracked",
  desktopPosition: "Google ranking details on desktop devices",
  mobilePosition: "Google ranking details on mobile devices",
};

function SortableHeader({
  column,
  label,
  id,
}: {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
  label: string;
  id: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs uppercase tracking-wide font-medium text-base-content/60 transition-colors hover:text-base-content"
      onClick={column.getToggleSortingHandler()}
      title={HEADER_TOOLTIPS[id]}
      aria-label={`Sort by ${label}`}
      aria-pressed={!!sorted}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3 shrink-0" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3 shrink-0" />
      ) : null}
    </button>
  );
}

const positionSort: SortingFn<RankTrackingRow> = (rowA, rowB, columnId) => {
  const device = columnId === "desktopPosition" ? "desktop" : "mobile";
  return comparePositions(
    rowA.original[device].position,
    rowB.original[device].position,
  );
};

const selectColumn: ColumnDef<RankTrackingRow> = {
  id: "select",
  size: 32,
  enableSorting: false,
  header: ({ table }) => (
    <input
      type="checkbox"
      className="checkbox checkbox-xs"
      checked={table.getIsAllRowsSelected()}
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  ),
  cell: ({ row }) => (
    <input
      type="checkbox"
      className="checkbox checkbox-xs"
      checked={row.getIsSelected()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
};

const keywordColumn: ColumnDef<RankTrackingRow> = {
  id: "keyword",
  accessorKey: "keyword",
  header: ({ column }) => (
    <SortableHeader column={column} label="Keyword" id="keyword" />
  ),
  cell: ({ getValue }) => (
    <span className="font-medium">{getValue<string>()}</span>
  ),
  sortingFn: "alphanumeric",
};

function makeDeviceColumn(
  device: "desktop" | "mobile",
  domain: string,
): ColumnDef<RankTrackingRow> {
  const id = device === "desktop" ? "desktopPosition" : "mobilePosition";
  const label = device === "desktop" ? "Desktop" : "Mobile";
  return {
    id,
    accessorFn: (row) => row[device].position,
    header: ({ column }) => (
      <SortableHeader column={column} label={label} id={id} />
    ),
    size: 176,
    minSize: 176,
    cell: ({ row }) => (
      <DeviceRankCell result={row.original[device]} domain={domain} />
    ),
    sortingFn: positionSort,
  };
}

export function useRankTrackingColumns(
  showDesktop: boolean,
  showMobile: boolean,
  domain: string,
): ColumnDef<RankTrackingRow>[] {
  return useMemo(() => {
    const cols: ColumnDef<RankTrackingRow>[] = [selectColumn, keywordColumn];
    if (showDesktop) cols.push(makeDeviceColumn("desktop", domain));
    if (showMobile) cols.push(makeDeviceColumn("mobile", domain));
    return cols;
  }, [showDesktop, showMobile, domain]);
}
