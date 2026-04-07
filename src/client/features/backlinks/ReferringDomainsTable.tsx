import { useMemo, useState } from "react";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import { ReferringDomainsTableHeader } from "./BacklinksTableHeaders";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  DEFAULT_REFERRING_DOMAINS_SORT,
  sortReferringDomainRows,
} from "./backlinksTableSorting";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";

export function ReferringDomainsTable({
  rows,
}: {
  rows: BacklinksOverviewData["referringDomains"];
}) {
  const [sort, setSort] = useState(DEFAULT_REFERRING_DOMAINS_SORT);
  const sortedRows = useMemo(
    () => sortReferringDomainRows(rows, sort),
    [rows, sort],
  );

  if (rows.length === 0) {
    return <EmptyTableState label="No referring domains match this filter." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <ReferringDomainsTableHeader sort={sort} onSortChange={setSort} />
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={`${row.domain ?? "domain"}-${index}`}>
              <td className="font-medium break-all">{row.domain ?? "-"}</td>
              <td>{formatNumber(row.backlinks)}</td>
              <td>{formatNumber(row.referringPages)}</td>
              <td>{formatNumber(row.rank)}</td>
              <td>{formatDecimal(row.spamScore)}</td>
              <td>{formatCompactDate(row.firstSeen)}</td>
              <td>
                <div className="text-sm">
                  <div>Broken links: {formatNumber(row.brokenBacklinks)}</div>
                  <div className="text-base-content/55">
                    Broken pages: {formatNumber(row.brokenPages)}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
