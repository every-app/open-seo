import { useMemo, useState } from "react";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import { BacklinksExternalLink } from "./BacklinksPageLinks";
import { TopPagesTableHeader } from "./BacklinksTableHeaders";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  DEFAULT_TOP_PAGES_SORT,
  sortTopPageRows,
} from "./backlinksTableSorting";
import { formatNumber } from "./backlinksPageUtils";

export function TopPagesTable({
  rows,
}: {
  rows: BacklinksOverviewData["topPages"];
}) {
  const [sort, setSort] = useState(DEFAULT_TOP_PAGES_SORT);
  const sortedRows = useMemo(() => sortTopPageRows(rows, sort), [rows, sort]);

  if (rows.length === 0) {
    return <EmptyTableState label="No top pages match this filter." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <TopPagesTableHeader sort={sort} onSortChange={setSort} />
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={`${row.page ?? "page"}-${index}`}>
              <td className="min-w-80">
                {row.page ? (
                  <BacklinksExternalLink
                    url={row.page}
                    label={row.page}
                    className="link link-hover break-all inline-flex items-center gap-1"
                  />
                ) : (
                  "-"
                )}
              </td>
              <td>{formatNumber(row.backlinks)}</td>
              <td>{formatNumber(row.referringDomains)}</td>
              <td>{formatNumber(row.rank)}</td>
              <td>{formatNumber(row.brokenBacklinks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
