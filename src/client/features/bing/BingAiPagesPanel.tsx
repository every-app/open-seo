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
  getBingAiPagesDetail,
  uploadBingAiPages,
} from "@/serverFunctions/bingAiCitations";

type PageRow = { page: string; citations: number };

const helper = createColumnHelper<PageRow>();
const columns: ColumnDef<PageRow>[] = [
  helper.accessor("page", {
    enableSorting: false,
    header: () => "Page",
    cell: ({ getValue }) => (
      <a
        href={getValue()}
        target="_blank"
        rel="noreferrer"
        className="link link-hover block max-w-xl truncate"
        title={getValue()}
      >
        {getValue()}
      </a>
    ),
  }),
  helper.accessor("citations", {
    header: ({ column }) => (
      <SortableHeader column={column} label="Citations" align="right" />
    ),
    cell: ({ getValue }) => formatCount(getValue()),
    meta: {
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
    },
  }),
];

export function BingAiPagesPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["bingAiPagesDetail", projectId, selectedId],
    queryFn: () =>
      getBingAiPagesDetail({ data: { projectId, snapshotId: selectedId } }),
  });

  const uploadMutation = useMutation({
    mutationFn: (input: {
      csvText: string;
      periodStart: string;
      periodEnd: string;
    }) => uploadBingAiPages({ data: { projectId, ...input } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.snapshot.rowCount} pages`);
      setSelectedId(null);
      void queryClient.invalidateQueries({
        queryKey: ["bingAiPagesDetail", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const rows: PageRow[] = query.data?.rows ?? [];
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
        <AiPanelLoading label="Loading page citations…" />
      ) : query.isError ? (
        <AiPanelError onRetry={() => void query.refetch()} />
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No Pages CSV imported yet — upload one to see per-page citations.
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
