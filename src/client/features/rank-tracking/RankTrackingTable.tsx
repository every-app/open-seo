import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  SortableHeader,
  DeviceRankCell,
  type SortField,
  type SortDir,
} from "./RankTrackingTableParts";
export {
  comparePositions,
  exportRankTrackingCsv,
} from "./RankTrackingTableParts";
export type { SortField, SortDir } from "./RankTrackingTableParts";

export function RankTrackingTable({
  totalCount,
  sorted,
  resultsLoading,
  showDesktop,
  showMobile,
  sortField,
  sortDir,
  onSort,
  domain,
  configId,
  projectId,
}: {
  totalCount: number;
  sorted: RankTrackingRow[];
  resultsLoading: boolean;
  showDesktop: boolean;
  showMobile: boolean;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  domain: string;
  configId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  // Only count/act on selections that are currently visible
  const visibleIds = new Set(sorted.map((r) => r.trackingKeywordId));
  const visibleSelected = new Set(
    [...selected].filter((id) => visibleIds.has(id)),
  );
  const visibleSelectedCount = visibleSelected.size;

  const removeMutation = useMutation({
    mutationFn: (keywordIds: string[]) =>
      removeTrackingKeywords({ data: { projectId, configId, keywordIds } }),
    onSuccess: (result) => {
      setSelected(new Set());
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (visibleSelectedCount === sorted.length && sorted.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((r) => r.trackingKeywordId)));
    }
  };

  if (resultsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-5 animate-spin text-base-content/50" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-base-300 p-10 text-center text-sm text-base-content/55">
        {totalCount === 0
          ? 'No rank data yet. Click "Check Now" to run your first check.'
          : "No keywords match your search."}
      </div>
    );
  }

  const allSelected =
    visibleSelectedCount === sorted.length && sorted.length > 0;

  return (
    <>
      {/* Bulk action bar */}
      {visibleSelectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2 text-sm">
          <span className="text-base-content/70">
            {visibleSelectedCount} keyword
            {visibleSelectedCount !== 1 ? "s" : ""} selected
          </span>
          <button
            className="btn btn-error btn-xs gap-1"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 className="size-3" />
            Remove
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <Modal>
          <h3 className="text-lg font-semibold">Remove keywords?</h3>
          <p className="text-sm text-base-content/70">
            This will stop tracking {visibleSelectedCount} keyword
            {visibleSelectedCount !== 1 ? "s" : ""}. Historical ranking data is
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
              onClick={() => removeMutation.mutate([...visibleSelected])}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && (
                <Loader2 className="size-3 animate-spin" />
              )}
              Remove {visibleSelectedCount} keyword
              {visibleSelectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </Modal>
      )}

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <SortableHeader
                label="Keyword"
                field="keyword"
                currentField={sortField}
                currentDir={sortDir}
                onClick={onSort}
              />
              {showDesktop && (
                <SortableHeader
                  label="Desktop"
                  field="desktopPosition"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={onSort}
                  className="min-w-44"
                />
              )}
              {showMobile && (
                <SortableHeader
                  label="Mobile"
                  field="mobilePosition"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={onSort}
                  className="min-w-44"
                />
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.trackingKeywordId}>
                <td className="w-8">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={selected.has(row.trackingKeywordId)}
                    onChange={() => toggleSelect(row.trackingKeywordId)}
                  />
                </td>
                <td className="font-medium">{row.keyword}</td>
                {showDesktop && (
                  <td className="align-top">
                    <DeviceRankCell result={row.desktop} domain={domain} />
                  </td>
                )}
                {showMobile && (
                  <td className="align-top">
                    <DeviceRankCell result={row.mobile} domain={domain} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-base-content/60 pt-2">
        {sorted.length} of {totalCount} keywords
      </p>
    </>
  );
}
