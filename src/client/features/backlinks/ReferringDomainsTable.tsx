import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
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

const columns = [
  columnHelper.accessor("domain", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Domain"
        helpText="The referring site linking to your target."
      />
    ),
    cell: ({ getValue }) => getValue() ?? "-",
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

const DEFAULT_SORTING: SortingState = [{ id: "backlinks", desc: true }];

export function ReferringDomainsTable({
  rows,
}: {
  rows: BacklinksOverviewData["referringDomains"];
}) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No referring domains match this filter." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={
                    cell.column.id === "domain"
                      ? "font-medium break-all"
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
