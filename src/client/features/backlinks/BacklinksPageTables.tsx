import { useMemo, useState } from "react";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import {
  BacklinksTableHeader,
  ReferringDomainsTableHeader,
  TopPagesTableHeader,
} from "./BacklinksTableHeaders";
import {
  BacklinksExternalLink,
  BacklinksSourceLink,
} from "./BacklinksPageLinks";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  DEFAULT_BACKLINKS_SORT,
  DEFAULT_REFERRING_DOMAINS_SORT,
  DEFAULT_TOP_PAGES_SORT,
  sortBacklinkRows,
  sortReferringDomainRows,
  sortTopPageRows,
} from "./backlinksTableSorting";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";

export function BacklinksTable({
  rows,
}: {
  rows: BacklinksOverviewData["backlinks"];
}) {
  const [sort, setSort] = useState(DEFAULT_BACKLINKS_SORT);
  const sortedRows = useMemo(() => sortBacklinkRows(rows, sort), [rows, sort]);

  if (rows.length === 0) {
    return <EmptyTableState label="No backlinks match this filter." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm table-zebra">
        <BacklinksTableHeader sort={sort} onSortChange={setSort} />
        <tbody>
          {sortedRows.map((row, index) => (
            <BacklinksTableRow
              key={`${row.urlFrom ?? row.domainFrom ?? "row"}-${index}`}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

function BacklinksTableRow({
  row,
}: {
  row: BacklinksOverviewData["backlinks"][number];
}) {
  const hasNotableFlags =
    row.isLost ||
    row.isBroken ||
    row.isDofollow === false ||
    (row.linksCount != null && row.linksCount > 1);

  return (
    <tr>
      <td className="min-w-52">
        <div className="space-y-0.5">
          <div className="font-medium">
            {row.domainFrom?.replace(/^www\./, "") ?? "-"}
          </div>
          {row.urlFrom ? (
            <BacklinksSourceLink url={row.urlFrom} maxLength={48} muted />
          ) : null}
        </div>
      </td>
      <td className="min-w-44">
        {row.urlTo ? (
          <BacklinksSourceLink url={row.urlTo} maxLength={40} />
        ) : (
          "-"
        )}
      </td>
      <td className="min-w-36">
        <div className="space-y-0.5">
          <span className="text-sm">{row.anchor || "No anchor text"}</span>
          {row.itemType ? (
            <div className="text-xs text-base-content/55">{row.itemType}</div>
          ) : null}
        </div>
      </td>
      <td>{hasNotableFlags ? <BacklinkFlags row={row} /> : null}</td>
      <td className="text-right tabular-nums text-sm">
        <span
          title={
            row.spamScore != null
              ? `Spam score: ${formatDecimal(row.spamScore)}`
              : undefined
          }
        >
          {formatNumber(row.rank)}
        </span>
      </td>
      <td className="text-right tabular-nums text-sm">
        {formatNumber(row.domainFromRank)}
      </td>
      <td className="whitespace-nowrap text-sm">
        <div>{formatCompactDate(row.firstSeen)}</div>
        {row.lastSeen ? (
          <div className="text-xs text-base-content/55">
            Last {formatCompactDate(row.lastSeen)}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function BacklinkFlags({
  row,
}: {
  row: BacklinksOverviewData["backlinks"][number];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.isLost ? (
        <span className="badge badge-sm badge-error badge-outline">Lost</span>
      ) : null}
      {row.isBroken ? (
        <span className="badge badge-sm badge-warning badge-outline">
          Broken
        </span>
      ) : null}
      {row.isDofollow === false ? (
        <span className="badge badge-sm badge-outline">Nofollow</span>
      ) : null}
      {row.linksCount != null && row.linksCount > 1 ? (
        <span className="badge badge-sm badge-outline inline-flex min-w-fit items-center whitespace-nowrap">
          {row.linksCount} links
        </span>
      ) : null}
    </div>
  );
}
