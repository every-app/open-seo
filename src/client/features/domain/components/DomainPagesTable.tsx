import { useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { ExternalUrlCell } from "@/client/components/table/url";
import { SortableHeader } from "@/client/features/domain/components/SortableHeader";
import {
  formatFloat,
  formatNumber,
  toPageSortMode,
} from "@/client/features/domain/utils";
import type {
  DomainSortMode,
  PageRow,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  domain: string;
  rows: PageRow[];
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  onSortClick: (sort: DomainSortMode) => void;
};

const pageColumnHelper = createColumnHelper<PageRow>();

export function DomainPagesTable({
  domain,
  rows,
  sortMode,
  currentSortOrder,
  onSortClick,
}: Props) {
  const columns = useMemo<ColumnDef<PageRow>[]>(
    () => [
      pageColumnHelper.display({
        id: "page",
        header: () => "Page",
        cell: ({ row }) => (
          <ExternalUrlCell
            value={row.original.relativePath ?? row.original.page}
            label={row.original.relativePath ?? row.original.page}
            baseDomain={domain}
            className="link link-primary inline-flex items-center gap-1"
          />
        ),
        meta: {
          cellClassName: "max-w-[420px] truncate",
        },
      }),
      pageColumnHelper.accessor("organicTraffic", {
        header: () => (
          <SortableHeader
            label="Organic Traffic"
            isActive={toPageSortMode(sortMode) === "traffic"}
            order={currentSortOrder}
            onClick={() => onSortClick("traffic")}
          />
        ),
        cell: ({ getValue }) => formatFloat(getValue()),
      }),
      pageColumnHelper.accessor("keywords", {
        header: () => (
          <SortableHeader
            label="Keywords"
            isActive={toPageSortMode(sortMode) === "keywords"}
            order={currentSortOrder}
            onClick={() => onSortClick("volume")}
          />
        ),
        cell: ({ getValue }) => formatNumber(getValue()),
      }),
    ],
    [currentSortOrder, domain, onSortClick, sortMode],
  );
  const table = useAppTable({
    data: rows.slice(0, 100),
    columns,
  });

  return (
    <AppDataTable
      table={table}
      className="table table-zebra table-sm"
      empty={
        <div className="py-6 text-center text-base-content/60">
          No pages match this search.
        </div>
      }
    />
  );
}
