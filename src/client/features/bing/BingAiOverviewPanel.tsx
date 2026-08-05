import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AiPanelError,
  AiPanelLoading,
  AiStatTile,
} from "@/client/features/bing/BingAiCitationsPanel";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getBingAiOverview,
  uploadBingAiOverview,
} from "@/serverFunctions/bingAiCitations";

export function BingAiOverviewPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bingAiOverview", projectId],
    queryFn: () => getBingAiOverview({ data: { projectId } }),
  });

  const uploadMutation = useMutation({
    mutationFn: (csvText: string) =>
      uploadBingAiOverview({ data: { projectId, csvText } }),
    onSuccess: (result) => {
      toast.success(
        `Imported ${result.rowCount} ${result.rowCount === 1 ? "day" : "days"}`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["bingAiOverview", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (query.isLoading) {
    return <AiPanelLoading label="Loading AI citation history…" />;
  }
  if (query.isError) {
    return <AiPanelError onRetry={() => void query.refetch()} />;
  }

  const days = query.data?.days ?? [];
  const totalCitations = days.reduce((sum, day) => sum + day.citations, 0);
  const latest = days[days.length - 1] ?? null;

  return (
    <div className="space-y-4">
      <UploadForm
        isPending={uploadMutation.isPending}
        onUpload={(csvText) => uploadMutation.mutate(csvText)}
      />
      {days.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <AiStatTile
              label="Days imported"
              value={days.length.toLocaleString()}
            />
            <AiStatTile
              label="Total citations"
              value={totalCitations.toLocaleString()}
              hint={`${days[0]?.date} to ${days[days.length - 1]?.date}`}
            />
            <AiStatTile
              label="Cited pages (latest day)"
              value={latest ? latest.citedPages.toLocaleString() : "—"}
              hint={latest?.date}
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Citations</th>
                  <th className="text-right">Cited pages</th>
                </tr>
              </thead>
              <tbody>
                {days
                  .toReversed()
                  .map((day) => (
                    <tr key={day.id}>
                      <td className="tabular-nums">{day.date}</td>
                      <td className="text-right tabular-nums">
                        {day.citations.toLocaleString()}
                      </td>
                      <td className="text-right tabular-nums">
                        {day.citedPages.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-base-content/60">
          No AI citation days imported yet — upload the Overview CSV to start
          the trend.
        </p>
      )}
    </div>
  );
}

function UploadForm({
  onUpload,
  isPending,
}: {
  onUpload: (csvText: string) => void;
  isPending: boolean;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    onUpload(await file.text());
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
      onSubmit={(event) => void submit(event)}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Overview CSV</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="file-input file-input-bordered file-input-sm"
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={!file || isPending}
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
