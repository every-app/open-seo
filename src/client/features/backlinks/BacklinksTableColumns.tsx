import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { BacklinksSourceLink } from "./BacklinksPageLinks";
import type { BacklinksRow } from "./backlinksPageTypes";
import type { BacklinksRowsSortField } from "@/types/schemas/backlinks";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";
import type { DomainRatings } from "./useAhrefsDomainRatings";

/**
 * Row model for the backlinks table. In the one-per-domain view, depth-0 rows
 * are each domain's strongest link and can expand into the domain's remaining
 * links (depth-1) plus a transient status row while they load.
 */
export type BacklinksDisplayRow =
  | {
      kind: "link";
      row: BacklinksRow;
      depth: 0 | 1;
      expandable: boolean;
      expanded: boolean;
    }
  | { kind: "status"; domain: string; status: "loading" | "error" | "empty" };

function BacklinkFlags({ row }: { row: BacklinksRow }) {
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
        <span className="badge badge-sm badge-outline min-w-fit whitespace-nowrap">
          {row.linksCount} links
        </span>
      ) : null}
    </div>
  );
}

function StatusCell({ status }: { status: "loading" | "error" | "empty" }) {
  if (status === "loading") {
    return (
      <span className="flex items-center gap-2 pl-6 text-sm text-base-content/60">
        <span className="loading loading-spinner loading-xs" />
        Loading links…
      </span>
    );
  }
  return (
    <span className="pl-6 text-sm text-base-content/60">
      {status === "error"
        ? "Couldn't load this domain's links."
        : "No other links from this domain."}
    </span>
  );
}

function SourceCell({
  displayRow,
  onToggleDomain,
}: {
  displayRow: BacklinksDisplayRow;
  onToggleDomain?: (domain: string) => void;
}) {
  if (displayRow.kind === "status") {
    return <StatusCell status={displayRow.status} />;
  }

  const { row, depth, expandable, expanded } = displayRow;
  if (depth > 0) {
    return (
      <div className="break-all pl-6">
        {row.urlFrom ? (
          <BacklinksSourceLink url={row.urlFrom} maxLength={48} muted />
        ) : (
          <span className="text-base-content/55">-</span>
        )}
      </div>
    );
  }

  const domainLabel = row.domainFrom?.replace(/^www\./, "") ?? "-";
  return (
    <div className="flex items-start gap-1.5 break-all">
      {expandable && row.domainFrom && onToggleDomain ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square shrink-0 -ml-1"
          aria-label={`${expanded ? "Hide" : "Show"} all links from ${domainLabel}`}
          aria-expanded={expanded}
          onClick={() => onToggleDomain(row.domainFrom ?? "")}
        >
          <ChevronRight
            className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
      ) : null}
      <div>
        <div className="font-semibold">{domainLabel}</div>
        {row.urlFrom ? (
          <BacklinksSourceLink url={row.urlFrom} maxLength={48} muted />
        ) : null}
      </div>
    </div>
  );
}

/** Renders nothing for status rows, the link cell otherwise. */
function linkCell(
  render: (row: BacklinksRow) => React.ReactNode,
): (ctx: { row: { original: BacklinksDisplayRow } }) => React.ReactNode {
  return ({ row }) =>
    row.original.kind === "link" ? render(row.original.row) : null;
}

function buildBaseColumns(
  onToggleDomain?: (domain: string) => void,
): ColumnDef<BacklinksDisplayRow>[] {
  // Sortable column ids ("rank", "domainRank", "spamScore", "firstSeen") map
  // to server-side sort fields — sorting re-queries DataForSEO across the
  // full backlink profile, not just the loaded page.
  return [
    {
      id: "source",
      enableSorting: false,
      header: () => (
        <HeaderHelpLabel label="Source" helpText="Page linking to you" />
      ),
      size: 250,
      minSize: 180,
      cell: ({ row }) => (
        <SourceCell displayRow={row.original} onToggleDomain={onToggleDomain} />
      ),
    },
    {
      id: "target",
      enableSorting: false,
      header: () => (
        <HeaderHelpLabel label="Target" helpText="Destination on your site" />
      ),
      size: 220,
      minSize: 150,
      cell: linkCell((row) => (
        <div className="break-all">
          {row.urlTo ? (
            <BacklinksSourceLink url={row.urlTo} maxLength={40} />
          ) : (
            "-"
          )}
        </div>
      )),
    },
    {
      id: "anchor",
      enableSorting: false,
      header: () => (
        <HeaderHelpLabel label="Anchor" helpText="Text or format of the link" />
      ),
      size: 150,
      minSize: 100,
      cell: linkCell((row) => (
        <div className="space-y-0.5 break-words">
          <span className="text-sm">{row.anchor || "No anchor text"}</span>
          {row.itemType ? (
            <div className="text-xs text-base-content/55">{row.itemType}</div>
          ) : null}
        </div>
      )),
    },
    {
      id: "flags",
      enableSorting: false,
      header: () => (
        <HeaderHelpLabel
          label="Flags"
          helpText="Special backlink attributes, such as lost, broken, nofollow, or multiple links from the same source."
        />
      ),
      size: 130,
      minSize: 80,
      cell: linkCell((row) => <BacklinkFlags row={row} />),
    },
    {
      id: "rank" satisfies BacklinksRowsSortField,
      accessorFn: (displayRow) =>
        displayRow.kind === "link" ? displayRow.row.rank : null,
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Link"
          helpText="Authority of the linking page"
          align="right"
        />
      ),
      size: 70,
      minSize: 50,
      sortDescFirst: true,
      cell: linkCell((row) => (
        <div className="text-right tabular-nums text-sm">
          {formatNumber(row.rank)}
        </div>
      )),
    },
    {
      id: "domainRank" satisfies BacklinksRowsSortField,
      accessorFn: (displayRow) =>
        displayRow.kind === "link" ? displayRow.row.domainFromRank : null,
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="DA"
          helpText="Authority of the linking domain"
          align="right"
        />
      ),
      size: 70,
      minSize: 50,
      sortDescFirst: true,
      cell: linkCell((row) => (
        <div className="text-right tabular-nums text-sm">
          {formatNumber(row.domainFromRank)}
        </div>
      )),
    },
    {
      id: "spamScore" satisfies BacklinksRowsSortField,
      accessorFn: (displayRow) =>
        displayRow.kind === "link" ? displayRow.row.spamScore : null,
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Spam"
          helpText="Estimated spam risk for this backlink. Higher scores are more likely to be manipulative or low quality."
          align="right"
        />
      ),
      size: 70,
      minSize: 50,
      sortDescFirst: true,
      cell: linkCell((row) => {
        const value = row.spamScore;
        return (
          <div className="text-right tabular-nums text-sm">
            {value != null && value > 0 ? Math.round(value) : null}
          </div>
        );
      }),
    },
    {
      id: "firstSeen" satisfies BacklinksRowsSortField,
      accessorFn: (displayRow) =>
        displayRow.kind === "link" ? displayRow.row.firstSeen : null,
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="First Seen"
          helpText="When this link was first discovered by the crawler"
        />
      ),
      size: 110,
      minSize: 80,
      sortDescFirst: true,
      cell: linkCell((row) => (
        <div className="whitespace-nowrap text-sm">
          <div>{formatCompactDate(row.firstSeen)}</div>
          {row.lastSeen ? (
            <div className="text-xs text-base-content/55">
              Last {formatCompactDate(row.lastSeen)}
            </div>
          ) : null}
        </div>
      )),
    },
  ];
}

/**
 * Columns for the backlinks table. When `domainRatings` is provided (the user
 * clicked "Ahrefs DR"), an Ahrefs DR column is inserted after DA; otherwise it
 * stays hidden. DR is loaded client-side from Ahrefs, so it can't participate
 * in server-side sorting.
 */
export function buildBacklinksColumns(
  domainRatings: DomainRatings | null,
  onToggleDomain?: (domain: string) => void,
): ColumnDef<BacklinksDisplayRow>[] {
  const baseColumns = buildBaseColumns(onToggleDomain);
  if (!domainRatings) return baseColumns;

  const ratings = domainRatings;
  const drColumn: ColumnDef<BacklinksDisplayRow> = {
    id: "ahrefsDr",
    enableSorting: false,
    header: () => (
      <span className="flex w-full justify-end">
        <HeaderHelpLabel
          label="Ahrefs DR"
          helpText="Ahrefs Domain Rating (0-100) for the linking domain."
        />
      </span>
    ),
    size: 90,
    minSize: 70,
    cell: linkCell((row) => {
      const domain = row.domainFrom?.replace(/^www\./, "");
      const dr = domain ? (ratings[domain] ?? null) : null;
      return (
        <div className="text-right tabular-nums text-sm">
          {dr == null ? "—" : formatDecimal(dr)}
        </div>
      );
    }),
  };

  const insertAt =
    baseColumns.findIndex((column) => column.id === "domainRank") + 1;
  return [
    ...baseColumns.slice(0, insertAt),
    drColumn,
    ...baseColumns.slice(insertAt),
  ];
}
