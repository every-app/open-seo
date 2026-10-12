import {
  getFilteredRowModel,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { useState } from "react";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import {
  DataTableToolbar,
  DataTableFilterToggle,
  DataTableFilterPanel,
  DataTableFilterGroup,
  DataTableRangeFilter,
} from "@/client/components/table/DataTableToolbar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/client/components/ui/select";

type Filter = { id: string; label: string; kind: "text" | "number" | "follow" };
export function DashboardDataTable<T>({
  rows,
  columns,
  filters,
  initialSorting,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  filters: Filter[];
  initialSorting?: SortingState;
}) {
  const [open, setOpen] = useState(false);
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageIndex: 0, pageSize: 25 },
      sorting: initialSorting,
    },
  });
  const count = table.getState().columnFilters.length;
  const clear = () => table.resetColumnFilters();
  return (
    <DataTable
      table={table}
      isFiltered={count > 0}
      onClearFilters={clear}
      empty={{ title: "No results yet" }}
      toolbar={
        <>
          <DataTableToolbar>
            <DataTableFilterToggle
              open={open}
              activeCount={count}
              onToggle={() => setOpen(!open)}
            />
          </DataTableToolbar>
          {open && (
            <DataTableFilterPanel activeCount={count} onReset={clear}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filters.map((filter) => {
                  const column = table.getColumn(filter.id)!;
                  const value = column.getFilterValue();
                  if (filter.kind === "number") {
                    const range = Array.isArray(value)
                      ? value.map((item) =>
                          typeof item === "number" ? item : undefined,
                        )
                      : [undefined, undefined];
                    const change = (index: number, input: string) => {
                      const next = [...range];
                      next[index] = input === "" ? undefined : Number(input);
                      column.setFilterValue(next);
                    };
                    return (
                      <DataTableRangeFilter
                        key={filter.id}
                        label={filter.label}
                        min={{
                          step: "any",
                          value: range[0] ?? "",
                          onChange: (e) => change(0, e.target.value),
                        }}
                        max={{
                          step: "any",
                          value: range[1] ?? "",
                          onChange: (e) => change(1, e.target.value),
                        }}
                      />
                    );
                  }
                  return (
                    <DataTableFilterGroup key={filter.id} label={filter.label}>
                      {filter.kind === "follow" ? (
                        <Select
                          items={[
                            { value: "all", label: "All links" },
                            { value: "Follow", label: "Follow" },
                            { value: "Nofollow", label: "Nofollow" },
                          ]}
                          value={typeof value === "string" ? value : "all"}
                          onValueChange={(v) =>
                            column.setFilterValue(v === "all" ? undefined : v)
                          }
                        >
                          <SelectTrigger aria-label={filter.label}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All links</SelectItem>
                            <SelectItem value="Follow">Follow</SelectItem>
                            <SelectItem value="Nofollow">Nofollow</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          aria-label={filter.label}
                          placeholder="Contains…"
                          value={typeof value === "string" ? value : ""}
                          onChange={(e) =>
                            column.setFilterValue(e.target.value)
                          }
                        />
                      )}
                    </DataTableFilterGroup>
                  );
                })}
              </div>
            </DataTableFilterPanel>
          )}
        </>
      }
      footer={
        table.getFilteredRowModel().rows.length > 25 ? (
          <TablePagination
            page={table.getState().pagination.pageIndex + 1}
            pageSize={25}
            totalCount={table.getFilteredRowModel().rows.length}
            onPageChange={(page) => table.setPageIndex(page - 1)}
          />
        ) : undefined
      }
    />
  );
}
