import { memo, useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { ExternalUrlCell } from "@/client/components/table/url";
import { SortableHeader } from "@/client/features/domain/components/SortableHeader";
import { useDomainRenderDebug } from "@/client/features/domain/domainDebug";
import {
  formatNumber,
  formatRounded,
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

function DomainPagesTableComponent({
  domain,
  rows,
  sortMode,
  currentSortOrder,
  onSortClick,
}: Props) {
  const renderStarted = performance.now();
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
        cell: ({ getValue }) => formatRounded(getValue()),
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
  useDomainRenderDebug("DomainPagesTable", {
    rows: rows.length,
    durationMs: Math.round(performance.now() - renderStarted),
    sortMode,
    currentSortOrder,
  });

  return (
    <AppDataTable
      table={table}
      className="table table-sm"
      empty={
        <div className="py-6 text-center text-base-content/60">
          No pages match this search.
        </div>
      }
    />
  );
}

export const DomainPagesTable = memo(DomainPagesTableComponent);
