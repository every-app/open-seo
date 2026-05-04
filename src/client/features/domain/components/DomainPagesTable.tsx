import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { SortableHeader } from "@/client/features/domain/components/SortableHeader";
import {
  formatFloat,
  formatNumber,
  resolveDomainPageHref,
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

export function DomainPagesTable({
  domain,
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
                isActive={toPageSortMode(sortMode) === "keywords"}
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
            rows.slice(0, 100).map((row) => {
              const href = resolveDomainPageHref(
                row.relativePath ?? row.page,
                domain,
              );

              return (
                <tr key={row.page}>
                  <td className="max-w-[420px] truncate" title={row.page}>
                    {href ? (
                      <SafeExternalLink
                        url={href}
                        label={row.relativePath ?? row.page}
                        className="link link-primary inline-flex items-center gap-1"
                      />
                    ) : (
                      (row.relativePath ?? row.page)
                    )}
                  </td>
                  <td>{formatFloat(row.organicTraffic)}</td>
                  <td>{formatNumber(row.keywords)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
