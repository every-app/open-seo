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
  rows: PageRow[];
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  onSortClick: (sort: DomainSortMode) => void;
};

export function DomainPagesTable({
  rows,
  sortMode,
  currentSortOrder,
  onSortClick,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra table-sm">
        <thead>
          <tr>
            <th>Page</th>
            <th>
              <SortableHeader
                label="Organic Traffic"
                isActive={toPageSortMode(sortMode) === "traffic"}
                order={currentSortOrder}
                onClick={() => onSortClick("traffic")}
              />
            </th>
            <th>
              <SortableHeader
                label="Keywords"
                isActive={toPageSortMode(sortMode) === "volume"}
                order={currentSortOrder}
                onClick={() => onSortClick("volume")}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-6 text-center text-base-content/60">
                No pages match this search.
              </td>
            </tr>
          ) : (
            rows.slice(0, 100).map((row) => (
              <tr key={row.page}>
                <td className="max-w-[420px] truncate" title={row.page}>
                  {row.relativePath ?? row.page}
                </td>
                <td>{formatFloat(row.organicTraffic)}</td>
                <td>{formatNumber(row.keywords)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
