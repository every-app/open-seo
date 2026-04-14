import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSavedKeywords,
  removeSavedKeyword,
} from "@/serverFunctions/keywords";
import {
  Download,
  Search,
  Loader2,
  AlertCircle,
  Trash2,
  Copy,
} from "lucide-react";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";

export const Route = createFileRoute("/_project/p/$projectId/saved")({
  component: SavedKeywordsPage,
});

type SavedKeyword = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
  fetchedAt: string | null;
};

function SavedKeywordsPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: savedKeywordsData, isLoading } = useQuery({
    queryKey: ["savedKeywords", projectId],
    queryFn: () => getSavedKeywords({ data: { projectId } }),
  });
  const savedKeywords: SavedKeyword[] = savedKeywordsData?.rows ?? [];

  const removeMutation = useMutation({
    mutationFn: (savedKeywordId: string) =>
      removeSavedKeyword({ data: { projectId, savedKeywordId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      captureClientEvent("saved_keywords:remove");
      toast.success("Keyword removed");
    },
    onError: (error) => {
      setRemoveError(getStandardErrorMessage(error, "Remove failed."));
    },
  });

  const handleDeleteSelected = async () => {
    setDeleting(true);
    setRemoveError(null);
    const ids = [...selected];
    for (const id of ids) {
      try {
        await removeMutation.mutateAsync(id);
      } catch {
        break;
      }
    }
    setDeleting(false);
    setSelected(new Set());
    setShowConfirm(false);
    void queryClient.invalidateQueries({
      queryKey: ["savedKeywords", projectId],
    });
    captureClientEvent("saved_keywords:bulk_remove");
    toast.success(
      `${ids.length} keyword${ids.length !== 1 ? "s" : ""} removed`,
    );
  };

  const handleCopySelected = () => {
    const keywords = savedKeywords
      .filter((kw) => selected.has(kw.id))
      .map((kw) => kw.keyword);
    void navigator.clipboard.writeText(keywords.join("\n"));
    toast.success(
      `${keywords.length} keyword${keywords.length !== 1 ? "s" : ""} copied`,
    );
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === savedKeywords.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(savedKeywords.map((kw) => kw.id)));
    }
  };

  const exportCsv = () => {
    if (savedKeywords.length === 0) {
      toast.error("No keywords to export");
      return;
    }
    const headers = [
      "Keyword",
      "Volume",
      "CPC",
      "Competition",
      "Difficulty",
      "Intent",
      "Fetched At",
    ];
    const csvRows = savedKeywords.map((kw) => [
      kw.keyword,
      kw.searchVolume ?? "",
      kw.cpc?.toFixed(2) ?? "",
      kw.competition?.toFixed(2) ?? "",
      kw.keywordDifficulty ?? "",
      kw.intent ?? "",
      kw.fetchedAt ?? "",
    ]);
    const csv = buildCsv(headers, csvRows);
    downloadCsv("saved-keywords.csv", csv);
    captureClientEvent("data:export", {
      source_feature: "saved_keywords",
      result_count: savedKeywords.length,
    });
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Saved Keywords</h1>
            <p className="text-sm text-base-content/70">
              Keywords you&apos;ve saved from keyword research.
            </p>
          </div>
          {savedKeywords.length > 0 && (
            <button className="btn btn-sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3" aria-busy>
              <div className="skeleton h-4 w-48" />
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-8 gap-3 items-center"
                >
                  <div className="skeleton h-4 col-span-2" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                </div>
              ))}
            </div>
          </div>
        ) : savedKeywords.length === 0 ? (
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body text-center py-12 text-base-content/50">
              <Search className="size-8 mx-auto mb-2 opacity-40" />
              <p>
                No saved keywords yet. Use the Keyword Research page to find and
                save keywords.
              </p>
            </div>
          </div>
        ) : (
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3">
              {removeError ? (
                <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{removeError}</span>
                </div>
              ) : null}

              {/* Bulk action bar or keyword count */}
              {selected.size > 0 ? (
                <div className="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2 text-sm">
                  <span className="text-base-content/70">
                    {selected.size} keyword
                    {selected.size !== 1 ? "s" : ""} selected
                  </span>
                  <button
                    className="btn btn-ghost btn-xs gap-1"
                    onClick={handleCopySelected}
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                  <button
                    className="btn btn-error btn-xs gap-1"
                    onClick={() => setShowConfirm(true)}
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-sm text-base-content/70">
                  {savedKeywords.length} saved keyword
                  {savedKeywords.length !== 1 ? "s" : ""}
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="table table-zebra table-sm">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={
                            selected.size === savedKeywords.length &&
                            savedKeywords.length > 0
                          }
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Keyword</th>
                      <th>Volume</th>
                      <th>CPC</th>
                      <th>Competition</th>
                      <th>Difficulty</th>
                      <th>Intent</th>
                      <th>Last Fetched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedKeywords.map((kw) => (
                      <tr key={kw.id}>
                        <td className="w-8">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            checked={selected.has(kw.id)}
                            onChange={() => toggleSelect(kw.id)}
                          />
                        </td>
                        <td className="font-medium">{kw.keyword}</td>
                        <td>{formatNumber(kw.searchVolume)}</td>
                        <td>
                          {kw.cpc == null ? "-" : `$${kw.cpc.toFixed(2)}`}
                        </td>
                        <td>
                          {kw.competition == null
                            ? "-"
                            : kw.competition.toFixed(2)}
                        </td>
                        <td>
                          <DifficultyBadge value={kw.keywordDifficulty} />
                        </td>
                        <td>
                          <span className="badge badge-sm badge-ghost">
                            {kw.intent ?? "?"}
                          </span>
                        </td>
                        <td className="text-xs text-base-content/50">
                          {kw.fetchedAt
                            ? new Date(kw.fetchedAt).toLocaleDateString()
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Confirm delete modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card bg-base-100 border border-base-300 w-full max-w-sm shadow-xl">
              <div className="card-body gap-4">
                <h3 className="text-lg font-semibold">Delete keywords?</h3>
                <p className="text-sm text-base-content/70">
                  This will permanently delete {selected.size} saved keyword
                  {selected.size !== 1 ? "s" : ""}.
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
                    onClick={() => void handleDeleteSelected()}
                    disabled={deleting}
                  >
                    {deleting && <Loader2 className="size-3 animate-spin" />}
                    Delete {selected.size} keyword
                    {selected.size !== 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DifficultyBadge({ value }: { value: number | null }) {
  if (value == null)
    return <span className="badge badge-ghost badge-sm">-</span>;
  if (value < 30)
    return <span className="badge badge-success badge-sm">{value}</span>;
  if (value <= 60)
    return <span className="badge badge-warning badge-sm">{value}</span>;
  return <span className="badge badge-error badge-sm">{value}</span>;
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}
