import {
  createColumnHelper,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  compareNumericNullsLast,
  dateNullsLast,
  isDescending,
  numericNullsLast,
  stringNullsLast,
} from "@/client/components/table/nullSafeSort";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";
import type { DomainRatings } from "./useAhrefsDomainRatings";

type ReferringDomainRow = BacklinksOverviewData["referringDomains"][number];

const columnHelper = createColumnHelper<ReferringDomainRow>();

// Nulls always to the bottom in both directions, same as the pre-TanStack
// implementation. Secondary compare on brokenPages must also keep nulls last —
// coercing to 0 would mix unknown values with real zeroes.
const sortByIssues: SortingFn<ReferringDomainRow> = (left, right, columnId) => {
  const descending = isDescending(left, columnId);
  const primary = compareNumericNullsLast(
    left.original.brokenBacklinks,
    right.original.brokenBacklinks,
    descending,
  );
  if (primary !== 0) return primary;
  return compareNumericNullsLast(
    left.original.brokenPages,
    right.original.brokenPages,
    descending,
  );
};

const baseColumns = [
  columnHelper.accessor("domain", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Domain"
        helpText="The referring site linking to your target."
      />
    ),
    cell: ({ getValue }) => {
      const domain = getValue();
      if (!domain) return "-";
      return (
        <SafeExternalLink
          url={getDomainWebsiteHref(domain)}
          label={domain}
          className="link link-primary link-hover break-all inline-flex items-center gap-1"
        />
      );
    },
    sortingFn: stringNullsLast,
  }),
  columnHelper.accessor("backlinks", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Backlinks"
        helpText="Total backlinks found from this domain."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.accessor("referringPages", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Referring Pages"
        helpText="Unique pages on this domain that link to your target."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.accessor("rank", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Rank"
        helpText="Authority score for the referring domain."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.accessor("spamScore", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Spam"
        helpText="Spam risk score for this referring domain."
      />
    ),
    cell: ({ getValue }) => formatDecimal(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.accessor("firstSeen", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="First Seen"
        helpText="When this domain was first discovered linking to your target."
      />
    ),
    cell: ({ getValue }) => formatCompactDate(getValue()),
    sortingFn: dateNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.display({
    id: "issues",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Issues"
        helpText="Broken link and broken page counts tied to this domain."
      />
    ),
    cell: ({ row }) => (
      <div className="text-sm">
        <div>Broken links: {formatNumber(row.original.brokenBacklinks)}</div>
        <div className="text-base-content/55">
          Broken pages: {formatNumber(row.original.brokenPages)}
        </div>
      </div>
    ),
    enableSorting: true,
    sortingFn: sortByIssues,
    sortDescFirst: true,
  }),
];

/**
 * Columns for the referring domains table. When `domainRatings` is provided
 * (the user clicked "Ahrefs DR"), an Ahrefs DR column is inserted after Rank;
 * otherwise it stays hidden.
 */
function buildReferringDomainColumns(domainRatings: DomainRatings | null) {
  if (!domainRatings) return baseColumns;

  const ratings = domainRatings;
  const drColumn = columnHelper.accessor(
    (row) => (row.domain ? (ratings[row.domain] ?? null) : null),
    {
      id: "ahrefsDr",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Ahrefs DR"
          helpText="Ahrefs Domain Rating (0-100) for this referring domain."
        />
      ),
      cell: ({ getValue }) => {
        const dr = getValue();
        return dr == null ? "—" : formatDecimal(dr);
      },
      sortingFn: numericNullsLast,
      sortDescFirst: true,
    },
  );

  const insertAt =
    baseColumns.findIndex(
      (column) => "accessorKey" in column && column.accessorKey === "rank",
    ) + 1;
  return [
    ...baseColumns.slice(0, insertAt),
    drColumn,
    ...baseColumns.slice(insertAt),
  ];
}

const DEFAULT_SORTING: SortingState = [{ id: "backlinks", desc: true }];

function getDomainWebsiteHref(domain: string) {
  try {
    return new URL(domain).toString();
  } catch {
    return `https://${domain}`;
  }
}

export function ReferringDomainsTable({
  rows,
  domainRatings,
}: {
  rows: BacklinksOverviewData["referringDomains"];
  domainRatings: DomainRatings | null;
}) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const columns = useMemo(
    () => buildReferringDomainColumns(domainRatings),
    [domainRatings],
  );

  const table = useAppTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    withSorting: true,
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No referring domains match this filter." />;
  }

  return (
    <AppDataTable
      table={table}
      getCellClassName={(_, columnId) =>
        columnId === "domain" ? "font-medium break-all" : undefined
      }
    />
  );
}
