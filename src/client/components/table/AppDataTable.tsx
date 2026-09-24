import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Header,
  type Row,
  type Table,
  type TableOptions,
} from "@tanstack/react-table";
import {
  useRef,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Table as TableRoot,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { cn } from "@/client/lib/utils";
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

type UseAppTableOptions<TData> = Omit<
  TableOptions<TData>,
  "getCoreRowModel"
> & {
  withSorting?: boolean;
  withExpanded?: boolean;
  withPagination?: boolean;
};

export function useAppTable<TData>(options: UseAppTableOptions<TData>) {
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
): ColumnDef<TData> {
  return {
    id: "select",
    size: 32,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        aria-label="Select all rows"
      />
    ),
    cell: ({ row, table }) => (
      <SelectionCheckbox row={row} table={table} anchorRef={anchorRef} />
    ),
  };
}

function SelectionCheckbox<TData>({
  row,
  table,
  anchorRef,
}: {
  row: Row<TData>;
  table: Table<TData>;
  anchorRef: MutableRefObject<SelectionAnchor | null>;
}) {
  const rangeHandledRef = useRef(false);
  return (
    <Checkbox
      checked={row.getIsSelected()}
      aria-label="Select row"
      onClick={(event) => {
        event.stopPropagation();
        rangeHandledRef.current = applyShiftRangeSelection(
          event,
          row,
          table,
          anchorRef,
        );
      }}
      onCheckedChange={(checked) => {
        if (rangeHandledRef.current) {
          rangeHandledRef.current = false;
          return;
        }
        row.toggleSelected(checked);
      }}
    />
  );
}

// Row density for the Atelier Table: compact data grids use xs.
const DENSITY = {
  sm: "[&_td]:px-3 [&_td]:py-2 [&_th]:h-9",
  xs: "text-xs [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2",
};

export function AppDataTable<TData>({
  table,
  className,
  density = "sm",
  striped,
  wrapperClassName = "overflow-x-auto",
  empty,
  isLoading,
  loading,
  getRowClassName,
  getRowProps,
  getCellClassName,
  fixedLayout,
  stickyHeader,
}: {
  table: Table<TData>;
  className?: string;
  density?: keyof typeof DENSITY;
  striped?: boolean;
  wrapperClassName?: string;
  empty?: ReactNode;
  isLoading?: boolean;
  loading?: ReactNode;
  getRowClassName?: (row: Row<TData>) => string | undefined;
  getRowProps?: (row: Row<TData>) => {
    onClick?: (event: MouseEvent<HTMLTableRowElement>) => void;
    className?: string;
  };
  getCellClassName?: (row: Row<TData>, columnId: string) => string | undefined;
  fixedLayout?: boolean;
  stickyHeader?: boolean;
}) {
  if (isLoading && loading) return <>{loading}</>;
  if (table.getRowModel().rows.length === 0 && empty) return <>{empty}</>;

  return (
    <TableRoot
      containerClassName={wrapperClassName}
      className={cn(
        DENSITY[density],
        striped && "[&_tbody_tr:nth-child(even)]:bg-muted/40",
        className,
      )}
      style={fixedLayout ? { tableLayout: "fixed" } : undefined}
    >
      {fixedLayout ? (
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => (
            <col key={column.id} style={{ width: column.getSize() }} />
          ))}
        </colgroup>
      ) : null}
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <HeaderCell
                key={header.id}
                header={header}
                fixedLayout={fixedLayout}
                stickyHeader={stickyHeader}
              />
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => {
          const rowProps = getRowProps?.(row);
          return (
            <TableRow
              key={row.id}
              onClick={rowProps?.onClick}
              className={[getRowClassName?.(row), rowProps?.className]
                .filter(Boolean)
                .join(" ")}
            >
              {row.getVisibleCells().map((cell) => {
                const metaClass = cell.column.columnDef.meta?.cellClassName;
                return (
                  <TableCell
                    key={cell.id}
                    className={[
                      typeof metaClass === "function"
                        ? metaClass(row)
                        : metaClass,
                      getCellClassName?.(row, cell.column.id),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </TableRoot>
  );
}

function HeaderCell<TData>({
  header,
  fixedLayout,
  stickyHeader,
}: {
  header: Header<TData, unknown>;
  fixedLayout?: boolean;
  stickyHeader?: boolean;
}) {
  const meta = header.column.columnDef.meta;
  return (
    <TableHead
      className={cn(
        stickyHeader && "sticky top-0 z-10 bg-muted",
        meta?.headerClassName,
      )}
      style={fixedLayout ? { width: header.getSize() } : undefined}
    >
      {header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext())}
    </TableHead>
  );
}
