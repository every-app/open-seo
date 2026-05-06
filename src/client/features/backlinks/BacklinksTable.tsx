import { useMemo } from "react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
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

  const table = useAppTable({
    data: groupedData,
    columns: backlinksColumns,
    initialState: {
      sorting: [{ id: "firstSeen", desc: true }],
    },
    getSubRows: (row) => row.subRows,
    withSorting: true,
    withExpanded: true,
    getRowCanExpand: (row) => row.depth === 0,
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No backlinks match this filter." />;
  }

  return (
    <AppDataTable
      table={table}
      fixedLayout
      getRowProps={(row) => ({
        className:
          row.depth === 0
            ? "cursor-pointer bg-base-200/50 transition-colors hover:bg-base-200/80"
            : "bg-base-100",
        onClick: row.depth === 0 ? row.getToggleExpandedHandler() : undefined,
      })}
    />
  );
}
