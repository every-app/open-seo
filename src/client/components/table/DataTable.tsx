import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type Table as TanStackTable,
  type TableOptions,
} from "@tanstack/react-table";
import {
  Fragment,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  applyShiftRangeSelection,
  type SelectionAnchor,
} from "./tableSelection";

type AppColumnMeta<TData> = {
  headerClassName?: string;
  cellClassName?: string | ((row: Row<TData>) => string | undefined);
};

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> extends AppColumnMeta<TData> {
    readonly __valueType?: TValue;
  }
}

type UseDataTableOptions<TData> = Omit<
  TableOptions<TData>,
  "getCoreRowModel"
> & {
  withSorting?: boolean;
  withExpanded?: boolean;
  withPagination?: boolean;
};

export function useDataTable<TData>(options: UseDataTableOptions<TData>) {
  const { withSorting, withExpanded, withPagination, ...tableOptions } =
    options;
  return useReactTable({
    ...tableOptions,
    getCoreRowModel: getCoreRowModel(),
    ...(withSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(withExpanded ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    ...(withPagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
  });
}

export function useSelectionAnchor(): MutableRefObject<SelectionAnchor | null> {
  return useRef<SelectionAnchor | null>(null);
}

export function makeSelectionColumn<TData>(
  anchorRef: MutableRefObject<SelectionAnchor | null>,
  /** Names each row checkbox for screen readers. */
  rowLabel: (row: Row<TData>) => string = () => "Select row",
): ColumnDef<TData> {
  return {
    id: "select",
    size: 32,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        // Some-selected also counts rows that can't be selected.
        indeterminate={
          table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
        }
        disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
        onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        aria-label="Select all rows"
      />
    ),
    cell: ({ row, table }) => (
      <SelectionCheckbox
        row={row}
        table={table}
        anchorRef={anchorRef}
        label={rowLabel(row)}
      />
    ),
  };
}

function SelectionCheckbox<TData>({
  row,
  table,
  anchorRef,
  label,
}: {
  row: Row<TData>;
  table: TanStackTable<TData>;
  anchorRef: MutableRefObject<SelectionAnchor | null>;
  label: string;
}) {
  return (
    <Checkbox
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      aria-label={label}
      // The checkbox is a span, so a shift+click would also select page text.
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={(event) => {
        event.stopPropagation();
        // A shift+click selects the range, so the checkbox must not toggle.
        if (applyShiftRangeSelection(event, row, table, anchorRef)) {
          event.preventBaseUIHandler();
        }
      }}
      onCheckedChange={(checked) => row.toggleSelected(checked)}
    />
  );
}

/** The frame around the rows, for table components that pass it through. */
export type DataTableFrameProps = {
  /** The first load: shows skeleton rows under the real headers. */
  isLoading?: boolean;
  /** True when filters are active. An empty table then offers `onClearFilters`. */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  /**
   * A load failure, for example a `QueryError`. It shows above the rows. With
   * no rows it replaces the table, so a failed load never reads as empty.
   */
  error?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
};

/**
 * The table body of a data table: sortable headers, skeleton rows while the
 * first page loads, and an empty state that says whether filters hide rows.
 *
 * The page owns sorting, pagination, filters and selection. It passes that
 * state to `useDataTable` and to `TablePagination`, usually from its search
 * params. Put the toolbar and the pagination footer in `toolbar` and `footer`.
 */
export function DataTable<TData>({
  table,
  isLoading = false,
  empty,
  isFiltered = false,
  onClearFilters,
  error,
  toolbar,
  footer,
  onRowClick,
  activeRowId,
  scrollClassName,
  renderExpandedRow,
}: DataTableFrameProps & {
  table: TanStackTable<TData>;
  /** Shown when there are no rows and no filters. */
  empty: Pick<
    ComponentProps<typeof EmptyState>,
    "kind" | "title" | "description" | "action"
  >;
  /** Makes each row clickable, for example to open its details beside the table. */
  onRowClick?: (
    row: Row<TData>,
    event: MouseEvent<HTMLTableRowElement>,
  ) => void;
  /** Highlights the row whose details are open. */
  activeRowId?: string;
  /** Caps the table height, for example `max-h-96`. The header stays in view while the rows scroll. */
  scrollClassName?: string;
  /** Details shown in a full-width row under an expanded row. */
  renderExpandedRow?: (row: Row<TData>) => ReactNode;
}) {
  const columns = table.getVisibleLeafColumns();
  const rows = table.getRowModel().rows;

  return (
    <TableCard>
      {toolbar}
      {error ? <div className="p-4">{error}</div> : null}
      {error && !isLoading && rows.length === 0 ? null : (
        <Table containerClassName={scrollClassName}>
          <TableHeader
            className={
              scrollClassName ? "sticky top-0 z-10 bg-card" : undefined
            }
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.columnDef.meta?.headerClassName}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }, (_, index) => (
                <TableRow key={index} aria-hidden>
                  {columns.map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton
                        className={
                          column.id === "select" ? "size-4" : "h-4 w-full"
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  {isFiltered ? (
                    <EmptyState
                      kind="filtered"
                      variant="plain"
                      title="No rows match these filters"
                      description="Change or clear the filters to see more rows."
                      action={
                        onClearFilters ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={onClearFilters}
                          >
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <EmptyState variant="plain" {...empty} />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    data-active={row.id === activeRowId ? "" : undefined}
                    className={
                      onRowClick
                        ? "cursor-pointer data-active:bg-primary/5 data-active:shadow-[inset_2px_0_0_var(--color-primary)]"
                        : undefined
                    }
                    onClick={
                      onRowClick ? (event) => onRowClick(row, event) : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta?.cellClassName;
                      return (
                        <TableCell
                          key={cell.id}
                          className={
                            typeof meta === "function" ? meta(row) : meta
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {renderExpandedRow && row.getIsExpanded() ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length}>
                        {renderExpandedRow(row)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      )}
      {footer}
    </TableCard>
  );
}
