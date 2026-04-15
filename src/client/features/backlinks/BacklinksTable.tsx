import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import { backlinksColumns } from "./BacklinksTableColumns";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { groupBacklinksByDomain } from "./backlinksPageUtils";

export function BacklinksTable({
  rows,
}: {
  rows: BacklinksOverviewData["backlinks"];
}) {
  const groupedData = useMemo(() => groupBacklinksByDomain(rows), [rows]);

  const table = useReactTable({
    data: groupedData,
    columns: backlinksColumns,
    initialState: {
      sorting: [{ id: "firstSeen", desc: true }],
    },
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => row.depth === 0,
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No backlinks match this filter." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => (
            <col key={column.id} style={{ width: column.getSize() }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} style={{ width: header.getSize() }}>
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
            <tr
              key={row.id}
              className={
                row.depth === 0
                  ? "cursor-pointer bg-base-200/50 transition-colors hover:bg-base-200/80"
                  : "bg-base-100"
              }
              onClick={
                row.depth === 0 ? row.getToggleExpandedHandler() : undefined
              }
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
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
