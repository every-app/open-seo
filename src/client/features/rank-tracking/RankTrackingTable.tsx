import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Modal } from "@/client/components/Modal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type {
  RankTrackingConfig,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";
import {
  depthToPages,
  estimateRankCheckCredits,
  pagesToDepth,
} from "@/shared/rank-tracking";
import { useRankTrackingColumns } from "./RankTrackingColumns";

export function RankTrackingTable({
  totalCount,
  rows,
  resultsLoading,
  showDesktop,
  showMobile,
  defaultSortId,
  domain,
  configId,
  projectId,
  devices,
  defaultSerpDepth,
  onRescanSelected,
  rescanDisabled,
}: {
  totalCount: number;
  rows: RankTrackingRow[];
  resultsLoading: boolean;
  showDesktop: boolean;
  showMobile: boolean;
  defaultSortId: string;
  domain: string;
  configId: string;
  projectId: string;
  devices: RankTrackingConfig["devices"];
  defaultSerpDepth: number;
  onRescanSelected: (keywordIds: string[], serpDepth: number) => void;
  rescanDisabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRescan, setShowRescan] = useState(false);
  const [rescanDepth, setRescanDepth] = useState(defaultSerpDepth);

  const columns = useRankTrackingColumns(showDesktop, showMobile, domain);

  const table = useReactTable({
    data: rows,
    columns,
    initialState: {
      sorting: [{ id: defaultSortId, desc: false }],
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.trackingKeywordId,
    enableRowSelection: true,
  });

  // Only includes rows that are in the current data (respects parent filtering)
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

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
      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2 text-sm">
          <span className="text-base-content/70">
            {selectedCount} keyword
            {selectedCount !== 1 ? "s" : ""} selected
          </span>
          <button
            className="btn btn-primary btn-xs gap-1"
            onClick={() => {
              setRescanDepth(defaultSerpDepth);
              setShowRescan(true);
            }}
            disabled={rescanDisabled}
            title={
              rescanDisabled
                ? "A rank check is already running"
                : "Rescan selected keywords"
            }
          >
            <RefreshCw className="size-3" />
            Rescan selected
          </button>
          <button
            className="btn btn-error btn-xs gap-1"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 className="size-3" />
            Remove
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => table.resetRowSelection()}
          >
            Clear
          </button>
        </div>
      )}

      {/* Rescan depth modal */}
      {showRescan && (
        <Modal maxWidth="max-w-md">
          <h3 className="text-lg font-semibold">
            Rescan {selectedCount} keyword
            {selectedCount !== 1 ? "s" : ""}
          </h3>
          <p className="text-sm text-base-content/60 -mt-2">
            Choose how many SERP pages to fetch for this run. The saved domain
            depth ({depthToPages(defaultSerpDepth)} page
            {depthToPages(defaultSerpDepth) !== 1 ? "s" : ""}) is not changed.
          </p>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">Search depth</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={depthToPages(rescanDepth)}
              onChange={(e) =>
                setRescanDepth(pagesToDepth(Number(e.target.value)))
              }
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((pages) => (
                <option key={pages} value={pages}>
                  {pages} {pages === 1 ? "page" : "pages"} (top {pages * 10}{" "}
                  results)
                </option>
              ))}
            </select>
            <div className="mt-1.5 text-xs text-base-content/60">
              Estimated cost: ~$
              {estimateRankCheckCredits(
                selectedCount,
                devices,
                rescanDepth,
              ).costUsd.toFixed(2)}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowRescan(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={() => {
                onRescanSelected(
                  selectedRows.map((r) => r.id),
                  rescanDepth,
                );
                setShowRescan(false);
                table.resetRowSelection();
              }}
              disabled={rescanDisabled}
            >
              <RefreshCw className="size-3" />
              Run rescan
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <Modal>
          <h3 className="text-lg font-semibold">Remove keywords?</h3>
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

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
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
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-base-content/60 pt-2">
        {rows.length} of {totalCount} keywords
      </p>
    </>
  );
}
