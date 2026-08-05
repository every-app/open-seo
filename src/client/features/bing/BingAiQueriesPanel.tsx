import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  AiPanelError,
  AiPanelLoading,
  BingAiSnapshotPicker,
  BingAiSnapshotUploadForm,
} from "@/client/features/bing/BingAiCitationsPanel";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { SEARCH_PERFORMANCE_PAGE_SIZES } from "@/types/schemas/search-performance";
import {
  getBingAiQueriesDetail,
  uploadBingAiQueries,
} from "@/serverFunctions/bingAiCitations";

type QueryRow = {
  query: string;
  intent: string;
  topic: string;
  citations: number;
  citationSharePercent: number;
};

const rightAligned = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

const helper = createColumnHelper<QueryRow>();
const columns: ColumnDef<QueryRow>[] = [
  helper.accessor("query", {
    enableSorting: false,
    header: () => "Grounding query",
    cell: ({ getValue }) => (
      <span className="block max-w-md truncate" title={getValue()}>
        {getValue()}
      </span>
    ),
  }),
  helper.accessor("intent", { header: () => "Intent" }),
  helper.accessor("topic", { header: () => "Topic" }),
  helper.accessor("citations", {
    header: ({ column }) => (
      <SortableHeader column={column} label="Citations" align="right" />
    ),
    cell: ({ getValue }) => formatCount(getValue()),
    meta: rightAligned,
  }),
  helper.accessor("citationSharePercent", {
    header: ({ column }) => (
      <SortableHeader column={column} label="Citation share" align="right" />
    ),
    cell: ({ getValue }) => `${getValue().toFixed(2)}%`,
    meta: rightAligned,
  }),
];

export function BingAiQueriesPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["bingAiQueriesDetail", projectId, selectedId],
    queryFn: () =>
      getBingAiQueriesDetail({ data: { projectId, snapshotId: selectedId } }),
  });

  const uploadMutation = useMutation({
    mutationFn: (input: {
      csvText: string;
      periodStart: string;
      periodEnd: string;
    }) => uploadBingAiQueries({ data: { projectId, ...input } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.snapshot.rowCount} queries`);
      setSelectedId(null);
      void queryClient.invalidateQueries({
        queryKey: ["bingAiQueriesDetail", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const rows: QueryRow[] = query.data?.rows ?? [];
  const table = useAppTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    initialState: {
      sorting: [{ id: "citations", desc: true }],
      pagination: { pageIndex: 0, pageSize: 50 },
    },
  });
  const pagination = table.getState().pagination;
  const snapshots = useMemo(() => query.data?.snapshots ?? [], [query.data]);

  return (
    <div className="space-y-4">
      <BingAiSnapshotUploadForm
        isPending={uploadMutation.isPending}
        onUpload={(input) => uploadMutation.mutate(input)}
      />

      {query.isLoading ? (
        <AiPanelLoading label="Loading query citations…" />
      ) : query.isError ? (
        <AiPanelError onRetry={() => void query.refetch()} />
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No Queries CSV imported yet — upload one to see grounding-query
          citations.
        </p>
      ) : (
        <div className="space-y-3">
          <BingAiSnapshotPicker
            snapshots={snapshots}
            selectedId={selectedId}
            onChange={setSelectedId}
          />
          <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm">
            <AppDataTable
              table={table}
              className="table table-zebra table-sm"
              wrapperClassName="overflow-x-auto"
            />
            <TablePagination
              page={pagination.pageIndex + 1}
              pageSize={pagination.pageSize}
              pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
              totalCount={rows.length}
              hasNextPage={table.getCanNextPage()}
              isLoading={false}
              onPageChange={(nextPage) => table.setPageIndex(nextPage - 1)}
              onPageSizeChange={(nextSize) => table.setPageSize(nextSize)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
