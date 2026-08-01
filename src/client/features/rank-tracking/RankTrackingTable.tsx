import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2, Sheet, Trash2 } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { buildCsv } from "@/client/lib/csv";
import { downloadCsv } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type {
  RankTrackingKeywordScheduleInterval,
  RankTrackingScheduledRow,
} from "@/types/schemas/rank-tracking";
import { useRankTrackingColumns } from "./RankTrackingColumns";
import { buildRankTrackingExport } from "./RankTrackingTableParts";
import {
  KeywordTrendModal,
  type KeywordTrendTarget,
} from "./KeywordTrendModal";
import type { SelectionAnchor } from "@/client/components/table/tableSelection";
import {
  KeywordIntervalMenu,
  rankTrackingKeywordSchedulesQueryKey,
} from "./RankTrackingTableToolbar";

export function RankTrackingTable({
  totalCount,
  rows,
  resultsLoading,
  intervalUpdatePending,
  showDesktop,
  showMobile,
  defaultSortId,
  domain,
  configId,
  projectId,
  locationCode,
  locationName,
  serpDepth,
  onSetKeywordInterval,
}: {
  totalCount: number;
  rows: RankTrackingScheduledRow[];
  resultsLoading: boolean;
  intervalUpdatePending: boolean;
  showDesktop: boolean;
  showMobile: boolean;
  defaultSortId: string;
  domain: string;
  configId: string;
  projectId: string;
  locationCode: number;
  locationName?: string | null;
  serpDepth: number;
  onSetKeywordInterval: (
    keywordIds: string[],
    interval: RankTrackingKeywordScheduleInterval,
  ) => void;
}) {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [trendTarget, setTrendTarget] = useState<KeywordTrendTarget | null>(
    null,
  );
  const selectAnchorRef = useRef<SelectionAnchor | null>(null);

  const handleKeywordClick = useCallback(
    (row: RankTrackingScheduledRow) =>
      setTrendTarget({
        trackingKeywordId: row.trackingKeywordId,
        keyword: row.keyword,
      }),
    [],
  );

  const columns = useRankTrackingColumns({
    showDesktop,
    showMobile,
    domain,
    selectAnchorRef,
    onKeywordClick: handleKeywordClick,
    locationName,
    onSetKeywordInterval: (row, interval) =>
      onSetKeywordInterval([row.trackingKeywordId], interval),
    intervalUpdatePending,
  });

  const table = useAppTable({
    data: rows,
    columns,
    initialState: {
      sorting: [{ id: defaultSortId, desc: false }],
    },
    withSorting: true,
    getRowId: (row) => row.trackingKeywordId,
    enableRowSelection: true,
  });

  // Only includes rows that are in the current data (respects parent filtering)
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const selectedRankRows = selectedRows.map((row) => row.original);

  const exportSelectionToSheets = () => {
    const { headers, rows: exportRows } = buildRankTrackingExport(
      selectedRankRows,
      showDesktop,
      showMobile,
    );
    void exportTableToSheets({
      headers,
      rows: exportRows,
      feature: "rank_tracking",
    });
  };

  const exportSelectionCsv = () => {
    const { headers, rows: exportRows } = buildRankTrackingExport(
      selectedRankRows,
      showDesktop,
      showMobile,
    );
    const csvRows = exportRows.map((row) =>
      row.map((cell, idx) =>
        idx === 3 && typeof cell === "number" ? cell.toFixed(2) : cell,
      ),
    );
    downloadCsv(
      `rank-tracking-${domain}-selected.csv`,
      buildCsv(headers, csvRows),
    );
    captureClientEvent("rank_tracking:export_csv", { scope: "selection" });
  };

  const removeMutation = useMutation({
    mutationFn: (keywordIds: string[]) =>
      removeTrackingKeywords({ data: { projectId, configId, keywordIds } }),
    onSuccess: (result) => {
      table.resetRowSelection();
      setShowConfirm(false);
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingResults", projectId, configId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingCostEstimate", projectId, configId],
      });
      void queryClient.invalidateQueries({
        queryKey: rankTrackingKeywordSchedulesQueryKey(projectId, configId),
      });
      toast.success(
        `${result.removed} keyword${result.removed !== 1 ? "s" : ""} removed`,
      );
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to remove keywords"));
    },
  });

  if (resultsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-5 animate-spin text-base-content/50" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-base-300 p-10 text-center text-sm text-base-content/55">
        {totalCount === 0
          ? 'No rank data yet. Click "Check Now" to run your first check.'
          : "No keywords match your search."}
      </div>
    );
  }

  return (
    <>
      <TableBulkActionBar
        selectedCount={selectedCount}
        onClear={() => table.resetRowSelection()}
        actions={
          <div className="flex items-center px-1.5">
            <KeywordIntervalMenu
              onSelect={(interval) =>
                onSetKeywordInterval(
                  selectedRankRows.map((row) => row.trackingKeywordId),
                  interval,
                )
              }
              busy={intervalUpdatePending}
              disabled={selectedCount === 0}
              title="Set schedule for selected keywords"
              dropdownClassName="dropdown dropdown-top dropdown-end"
              buttonClassName="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-base-content/85 hover:bg-base-content/10 disabled:opacity-50"
              menuClassName="dropdown-content menu z-10 mb-2 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
            />
            <TableBulkActionButton
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setShowConfirm(true)}
              variant="danger"
            >
              Remove
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Export to Sheets",
                  icon: <Sheet className="size-4" />,
                  onClick: exportSelectionToSheets,
                },
                {
                  label: "Export CSV",
                  icon: <FileDown className="size-4" />,
                  onClick: exportSelectionCsv,
                },
              ]}
            />
          </div>
        }
      />

      {/* Confirm modal */}
      {showConfirm && (
        <Modal
          onClose={() => setShowConfirm(false)}
          labelledBy="remove-keywords-title"
        >
          <h3 id="remove-keywords-title" className="text-lg font-semibold">
            Remove keywords?
          </h3>
          <p className="text-sm text-base-content/70">
            This will stop tracking {selectedCount} keyword
            {selectedCount !== 1 ? "s" : ""}. Historical ranking data is
            preserved but won't appear in the table.
          </p>
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-error btn-sm gap-1"
              onClick={() =>
                removeMutation.mutate(selectedRows.map((r) => r.id))
              }
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && (
                <Loader2 className="size-3 animate-spin" />
              )}
              Remove {selectedCount} keyword
              {selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </Modal>
      )}

      {trendTarget && (
        <KeywordTrendModal
          target={trendTarget}
          projectId={projectId}
          configId={configId}
          domain={domain}
          locationCode={locationCode}
          locationName={locationName ?? undefined}
          serpDepth={serpDepth}
          onClose={() => setTrendTarget(null)}
        />
      )}

      <AppDataTable table={table} getCellClassName={() => "align-top"} />
      <p className="text-xs text-base-content/60 pt-2">
        {rows.length} of {totalCount} keywords
      </p>
    </>
  );
}
