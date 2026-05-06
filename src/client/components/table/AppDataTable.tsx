import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
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
};

export function useAppTable<TData>(options: UseAppTableOptions<TData>) {
  const { withSorting, withExpanded, ...tableOptions } = options;
  return useReactTable({
    ...tableOptions,
    getCoreRowModel: getCoreRowModel(),
    ...(withSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(withExpanded ? { getExpandedRowModel: getExpandedRowModel() } : {}),
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
      <input
        type="checkbox"
        className="checkbox checkbox-xs [--radius-selector:0.25rem]"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
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
    <input
      type="checkbox"
      className="checkbox checkbox-xs [--radius-selector:0.25rem]"
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
      onChange={(event) => {
        if (rangeHandledRef.current) {
          rangeHandledRef.current = false;
          return;
        }
        row.getToggleSelectedHandler()(event);
      }}
    />
  );
}

export function AppDataTable<TData>({
  table,
  className = "table table-sm",
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
    <div className={wrapperClassName}>
      <table
        className={className}
        style={fixedLayout ? { tableLayout: "fixed" } : undefined}
      >
        {fixedLayout ? (
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <HeaderCell
                  key={header.id}
                  header={header}
                  fixedLayout={fixedLayout}
                  stickyHeader={stickyHeader}
                />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const rowProps = getRowProps?.(row);
            return (
              <tr
                key={row.id}
                onClick={rowProps?.onClick}
                className={[getRowClassName?.(row), rowProps?.className]
                  .filter(Boolean)
                  .join(" ")}
              >
                {row.getVisibleCells().map((cell) => {
                  const rawMeta: unknown = cell.column.columnDef.meta;
                  const meta = isAppColumnMeta<TData>(rawMeta)
                    ? rawMeta
                    : undefined;
                  const metaClass = meta?.cellClassName;
                  return (
                    <td
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  const rawMeta: unknown = header.column.columnDef.meta;
  const meta = isAppColumnMeta<TData>(rawMeta) ? rawMeta : undefined;
  return (
    <th
      className={[
        stickyHeader ? "bg-base-200" : undefined,
        meta?.headerClassName,
      ]
        .filter(Boolean)
        .join(" ")}
      style={fixedLayout ? { width: header.getSize() } : undefined}
    >
      {header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext())}
    </th>
  );
}

function isAppColumnMeta<TData>(value: unknown): value is AppColumnMeta<TData> {
  return typeof value === "object" && value !== null;
}
