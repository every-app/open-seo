import { createColumnHelper } from "@tanstack/react-table";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useMemo } from "react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import type { ReferringDomainRow } from "./backlinksPageTypes";
import type { ReferringDomainsSortField } from "@/types/schemas/backlinks";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";
import type { DomainRatings } from "./useAhrefsDomainRatings";

const columnHelper = createColumnHelper<ReferringDomainRow>();

// Column ids map to server-side sort fields; sorting re-queries DataForSEO
// across all referring domains, not just the loaded page.
const baseColumns = [
  columnHelper.accessor("domain", {
    id: "domain" satisfies ReferringDomainsSortField,
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
  }),
  columnHelper.accessor("backlinks", {
    id: "backlinks" satisfies ReferringDomainsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Backlinks"
        helpText="Total backlinks found from this domain."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("referringPages", {
    id: "referringPages" satisfies ReferringDomainsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Referring Pages"
        helpText="Unique pages on this domain that link to your target."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("rank", {
    id: "rank" satisfies ReferringDomainsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Rank"
        helpText="Authority score for the referring domain."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("spamScore", {
    id: "spamScore" satisfies ReferringDomainsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Spam"
        helpText="Spam risk score for this referring domain."
      />
    ),
    cell: ({ getValue }) => formatDecimal(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("firstSeen", {
    id: "firstSeen" satisfies ReferringDomainsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="First Seen"
        helpText="When this domain was first discovered linking to your target."
      />
    ),
    cell: ({ getValue }) => formatCompactDate(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("brokenBacklinks", {
    id: "brokenBacklinks" satisfies ReferringDomainsSortField,
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
    sortDescFirst: true,
  }),
];

/**
 * Columns for the referring domains table. When `domainRatings` is provided
 * (the user clicked "Ahrefs DR"), an Ahrefs DR column is inserted after Rank;
 * otherwise it stays hidden. DR is loaded client-side from Ahrefs, so it can't
 * participate in server-side sorting.
 */
function buildReferringDomainColumns(domainRatings: DomainRatings | null) {
  if (!domainRatings) return baseColumns;

  const ratings = domainRatings;
  const drColumn = columnHelper.display({
    id: "ahrefsDr",
    header: () => (
      <HeaderHelpLabel
        label="Ahrefs DR"
        helpText="Ahrefs Domain Rating (0-100) for this referring domain."
      />
    ),
    cell: ({ row }) => {
      const domain = row.original.domain;
      const dr = domain ? (ratings[domain] ?? null) : null;
      return dr == null ? "—" : formatDecimal(dr);
    },
  });

  const insertAt = baseColumns.findIndex((column) => column.id === "rank") + 1;
  return [
    ...baseColumns.slice(0, insertAt),
    drColumn,
    ...baseColumns.slice(insertAt),
  ];
}

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
  sorting,
  onSortingChange,
}: {
  rows: ReferringDomainRow[];
  domainRatings: DomainRatings | null;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}) {
  const columns = useMemo(
    () => buildReferringDomainColumns(domainRatings),
    [domainRatings],
  );

  const table = useAppTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
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
