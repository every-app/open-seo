import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { Loader2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { getDomainKeywordSuggestions } from "@/serverFunctions/domain";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { SortableHeader } from "./RankTrackingColumns";
import {
  applyShiftRangeSelection,
  type SelectionAnchor,
} from "./tableSelection";

type SuggestedKeyword = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
};

const PRE_SELECT_COUNT = 20;

const baseColumns: ColumnDef<SuggestedKeyword>[] = [
  {
    id: "keyword",
    accessorKey: "keyword",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Keyword"
        id="keyword"
        tooltip="The search term this domain ranks for"
      />
    ),
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue<string>()}</span>
    ),
    sortingFn: "alphanumeric",
  },
  {
    id: "position",
    accessorKey: "position",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Position"
        id="position"
        tooltip="Current Google ranking position"
      />
    ),
    cell: ({ getValue }) => {
      const pos = getValue<number | null>();
      return pos != null ? (
        pos
      ) : (
        <span className="text-base-content/40">—</span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.position ?? 999;
      const b = rowB.original.position ?? 999;
      return a - b;
    },
  },
  {
    id: "searchVolume",
    accessorKey: "searchVolume",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Volume"
        id="searchVolume"
        tooltip="Monthly search volume"
      />
    ),
    cell: ({ getValue }) => {
      const vol = getValue<number | null>();
      return vol != null ? (
        vol.toLocaleString()
      ) : (
        <span className="text-base-content/40">—</span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.searchVolume ?? 0;
      const b = rowB.original.searchVolume ?? 0;
      return a - b;
    },
  },
  {
    id: "traffic",
    accessorKey: "traffic",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Traffic"
        id="traffic"
        tooltip="Estimated monthly organic traffic"
      />
    ),
    cell: ({ getValue }) => {
      const traffic = getValue<number | null>();
      return traffic != null ? (
        Math.round(traffic).toLocaleString()
      ) : (
        <span className="text-base-content/40">—</span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.traffic ?? 0;
      const b = rowB.original.traffic ?? 0;
      return a - b;
    },
  },
];

type Props = {
  configId: string;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  onDone: (configId: string) => void;
  onClose: () => void;
};

export function KeywordSuggestionStep({
  configId,
  projectId,
  domain,
  locationCode,
  languageCode,
  onDone,
  onClose,
}: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [hasInitialized, setHasInitialized] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "position", desc: false },
  ]);
  const selectAnchorRef = useRef<SelectionAnchor | null>(null);

  const columns = useMemo<ColumnDef<SuggestedKeyword>[]>(
    () => [
      {
        id: "select",
        size: 32,
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row, table }) => (
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={row.getIsSelected()}
            onClick={(event) => {
              event.stopPropagation();
              applyShiftRangeSelection(event, row, table, selectAnchorRef);
            }}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      ...baseColumns,
    ],
    [],
  );

  const suggestionsQuery = useQuery({
    queryKey: [
      "domainKeywordSuggestions",
      projectId,
      domain,
      locationCode,
      languageCode,
    ],
    queryFn: () =>
      getDomainKeywordSuggestions({
        data: { projectId, domain, locationCode, languageCode },
      }),
  });

  const data = suggestionsQuery.data ?? [];

  // Pre-select top 20 by position once data loads
  useEffect(() => {
    const items = suggestionsQuery.data;
    if (items && items.length > 0 && !hasInitialized) {
      // Data comes sorted by search volume from the API, but we display sorted
      // by position. Pre-select the 20 with the best (lowest) positions.
      const indexed = items.map((item, i) => ({
        index: i,
        position: item.position ?? 999,
      }));
      indexed.sort((a, b) => a.position - b.position);
      const initial: RowSelectionState = {};
      for (let i = 0; i < Math.min(PRE_SELECT_COUNT, indexed.length); i++) {
        initial[indexed[i].index] = true;
      }
      setRowSelection(initial);
      setHasInitialized(true);
    }
  }, [suggestionsQuery.data, hasInitialized]);

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).filter(
    (k) => rowSelection[k],
  ).length;

  const addMutation = useMutation({
    mutationFn: (keywords: string[]) =>
      addTrackingKeywords({ data: { projectId, configId, keywords } }),
    onSuccess: (result) => {
      toast.success(`Added ${result.added} keywords for tracking`);
      onDone(configId);
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to add keywords"));
    },
  });

  const handleAdd = () => {
    const selectedKeywords = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.keyword);
    if (selectedKeywords.length > 0) {
      addMutation.mutate(selectedKeywords);
    }
  };

  const sectionHeader = (title: string) => (
    <div className="flex items-center justify-between">
      <h2 id="keyword-suggestions-title" className="text-lg font-semibold">
        {title}
      </h2>
      <button className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
        <X className="size-4" />
      </button>
    </div>
  );

  // Loading state
  if (suggestionsQuery.isLoading) {
    return (
      <>
        {sectionHeader("Finding your top keywords...")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-xs text-base-content/50">
            This usually takes a few seconds
          </p>
        </div>
      </>
    );
  }

  // Error state
  if (suggestionsQuery.isError) {
    return (
      <>
        {sectionHeader("Couldn't fetch keywords")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <AlertCircle className="size-8 text-error" />
          <p className="text-xs text-base-content/50">
            You can try again or add keywords manually later.
          </p>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Skip
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => suggestionsQuery.refetch()}
            >
              Try Again
            </button>
          </div>
        </div>
      </>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <>
        {sectionHeader("No rankings found")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-xs text-base-content/50">
            We couldn't find any keywords {domain} currently ranks for. You can
            add keywords manually.
          </p>
          <button className="btn btn-primary btn-sm mt-2" onClick={onClose}>
            Continue
          </button>
        </div>
      </>
    );
  }

  // Data loaded
  return (
    <div className="flex flex-col gap-3">
      {sectionHeader("Choose keywords to track")}
      <div className="flex items-center justify-between">
        <p className="text-sm text-base-content/60">
          We found {data.length} keywords {domain} ranks for.
        </p>
        <span className="text-xs text-base-content/50">
          {selectedCount} of {data.length} selected
        </span>
      </div>

      <div className="overflow-y-auto max-h-[400px] border border-base-300 rounded-lg">
        <table className="table table-xs table-pin-rows w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="bg-base-200">
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
                className="hover:bg-base-200/50 cursor-pointer"
                onClick={(event) => {
                  if (
                    applyShiftRangeSelection(event, row, table, selectAnchorRef)
                  ) {
                    return;
                  }

                  row.toggleSelected();
                }}
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

      <div className="flex items-center justify-end gap-3 pt-1">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Skip
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={selectedCount === 0 || addMutation.isPending}
          onClick={handleAdd}
        >
          {addMutation.isPending && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          Add {selectedCount} Keyword{selectedCount !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
