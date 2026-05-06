import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { useState } from "react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  numericNullsLast,
  stringNullsLast,
} from "@/client/components/table/nullSafeSort";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import { BacklinksExternalLink } from "./BacklinksPageLinks";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { formatNumber } from "./backlinksPageUtils";

type TopPageRow = BacklinksOverviewData["topPages"][number];

const columnHelper = createColumnHelper<TopPageRow>();

const columns = [
  columnHelper.accessor("page", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Page"
        helpText="Page on the target site receiving backlinks."
      />
    ),
    cell: ({ getValue }) => {
      const page = getValue();
      return page ? (
        <BacklinksExternalLink
          url={page}
          label={page}
          className="link link-hover break-all inline-flex items-center gap-1"
        />
      ) : (
        "-"
      );
    },
    sortingFn: stringNullsLast,
  }),
  columnHelper.accessor("backlinks", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Backlinks"
        helpText="Total backlinks pointing to this page."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.accessor("referringDomains", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Referring Domains"
        helpText="Unique domains linking to this page."
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
        helpText="Authority score for this target page."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
  columnHelper.accessor("brokenBacklinks", {
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Broken Backlinks"
        helpText="Backlinks pointing here that are currently broken."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortingFn: numericNullsLast,
    sortDescFirst: true,
  }),
];

const DEFAULT_SORTING: SortingState = [{ id: "backlinks", desc: true }];

export function TopPagesTable({
  rows,
}: {
  rows: BacklinksOverviewData["topPages"];
}) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const table = useAppTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    withSorting: true,
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No top pages match this filter." />;
  }

  return (
    <AppDataTable
      table={table}
      getCellClassName={(_, columnId) =>
        columnId === "page" ? "min-w-80" : undefined
      }
    />
  );
}
