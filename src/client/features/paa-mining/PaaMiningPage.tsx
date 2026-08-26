import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, MessageSquareQuote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deletePaaMiningScan,
  getPaaMiningStatus,
  getPaaMiningView,
  listPaaMiningScans,
  runPaaMiningScan,
} from "@/serverFunctions/paaMining";
import { PAA_MINING_REGIONS, type PaaMiningRegion } from "@/shared/paa-mining";
import { PaaMiningReport } from "./PaaMiningReport";
import { ConnectSerperCard, ModuleDisabledCard } from "./ConnectSerperCard";

export function PaaMiningPage({
  projectId,
  scanId,
  onOpenScan,
}: {
  projectId: string;
  scanId: string | null;
  onOpenScan: (scanId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [seed, setSeed] = useState("");
  const [region, setRegion] = useState<PaaMiningRegion>("US");
  const [syncedScanId, setSyncedScanId] = useState<string | null>(null);

  const { data: connection } = useQuery({
    queryKey: ["paaMiningModule"],
    queryFn: () => getPaaMiningStatus(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: history } = useQuery({
    queryKey: ["paaMiningHistory", projectId],
    queryFn: () => listPaaMiningScans({ data: { projectId } }),
  });

  const runMutation = useMutation({
    mutationFn: () => runPaaMiningScan({ data: { projectId, seed, region } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["paaMiningHistory", projectId],
      });
      onOpenScan(result.scanId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (target: string) =>
      deletePaaMiningScan({ data: { projectId, scanId: target } }),
    onSuccess: (_data, target) => {
      void queryClient.invalidateQueries({
        queryKey: ["paaMiningHistory", projectId],
      });
      if (target === scanId) onOpenScan(null);
      toast.success("Scan removed from history.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: view } = useQuery({
    queryKey: ["paaMiningView", projectId, scanId],
    queryFn: () => getPaaMiningView({ data: { projectId, scanId: scanId! } }),
    enabled: scanId !== null,
  });

  const historyEntry =
    scanId === null ? undefined : history?.find((h) => h.scanId === scanId);

  // When a scan is opened, seed the input from its history row so the user can
  // see what produced this report and run a tweaked version.
  useEffect(() => {
    if (scanId === null || scanId === syncedScanId) return;
    if (historyEntry !== undefined) {
      setSeed(historyEntry.seed);
      const known = PAA_MINING_REGIONS.find(
        (code) => code === historyEntry.region,
      );
      if (known) setRegion(known);
      setSyncedScanId(scanId);
    } else if (view?.status === "completed") {
      setSeed(view.report.seed);
      const known = PAA_MINING_REGIONS.find(
        (code) => code === view.report.region,
      );
      if (known) setRegion(known);
      setSyncedScanId(scanId);
    }
  }, [scanId, syncedScanId, historyEntry, view]);

  const onRegionChange = (value: string) => {
    const next = PAA_MINING_REGIONS.find((code) => code === value);
    if (next) setRegion(next);
  };

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">PAA + Social Mining</h1>
          <p className="text-sm text-base-content/70">
            Demand discovery: extract People Also Ask questions for a seed and
            mine the social threads answering them, surfacing language, pain
            points, and angles that keyword tools miss.
          </p>
        </div>

        {connection && !connection.enabled ? (
          <ModuleDisabledCard />
        ) : connection && !connection.configured ? (
          <ConnectSerperCard />
        ) : (
          <>
            {connection && connection.configured && !connection.ok && (
              <div className="alert alert-warning text-sm">
                {connection.message ??
                  "The Serper.dev connection could not be verified."}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (runMutation.isPending) return;
                if (seed.trim().length === 0) {
                  toast.error("Enter a seed keyword to mine.");
                  return;
                }
                runMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="card flex flex-col border border-base-300 bg-base-100 p-[7px] sm:flex-row sm:items-stretch">
                  <input
                    className="min-w-0 flex-[2] rounded-[6px] bg-transparent px-4 py-3 text-[15px] outline-none transition-shadow placeholder:text-base-content/35 focus:ring-2 focus:ring-primary/50"
                    placeholder="Seed keyword (e.g. 'CRM for solopreneurs')"
                    maxLength={150}
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                  <div className="my-[9px] hidden w-px bg-base-300 sm:block" />
                  <select
                    className="cursor-pointer rounded-[6px] bg-transparent px-4 py-3 text-[15px] outline-none transition-shadow focus:ring-2 focus:ring-primary/50"
                    value={region}
                    onChange={(e) => onRegionChange(e.target.value)}
                  >
                    {PAA_MINING_REGIONS.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary mx-1.5 self-center px-7"
                    type="submit"
                    disabled={runMutation.isPending}
                  >
                    {runMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MessageSquareQuote className="size-4" />
                    )}
                    Mine
                  </button>
                </div>
                <p className="px-1 text-[13px] text-base-content/45">
                  Uses Serper.dev search credits — typically 30–60 calls per
                  run. Costs about $0.02 per seed.
                </p>
              </div>
            </form>

            {runMutation.isPending && (
              <div className="card border border-base-300 bg-base-100">
                <div className="card-body items-center gap-3 p-8">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm text-base-content/70">
                    Mining People Also Ask questions and the social threads
                    answering them…
                  </p>
                </div>
              </div>
            )}

            {view?.status === "failed" && (
              <div className="alert alert-error text-sm">
                {view.error?.message ?? "The scan failed. Please try again."}
              </div>
            )}

            {view?.status === "completed" && (
              <PaaMiningReport report={view.report} />
            )}

            {scanId === null &&
              (history === undefined || history.length === 0) &&
              !runMutation.isPending && (
                <div className="card border border-dashed border-base-300 bg-base-100">
                  <div className="card-body items-center gap-2 p-10 text-center">
                    <div className="flex size-10 items-center justify-center rounded-[3px] bg-base-200">
                      <MessageSquareQuote className="size-5 text-base-content/40" />
                    </div>
                    <p className="text-sm font-medium text-base-content/70">
                      Run your first PAA + social mining scan
                    </p>
                    <p className="max-w-sm text-xs text-base-content/40">
                      Enter a seed keyword to extract the People Also Ask
                      questions, then mine Reddit and Quora for what people
                      actually say when answering them.
                    </p>
                  </div>
                </div>
              )}

            {history !== undefined && history.length > 0 && (
              <HistoryCard
                history={history}
                activeScanId={scanId}
                onOpenScan={onOpenScan}
                onDelete={(target) => deleteMutation.mutate(target)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

type HistoryEntry = {
  scanId: string;
  seed: string;
  region: string;
  questionCount: number | null;
  createdAt: string;
};

function formatScanDate(timestamp: string): string {
  const ms = Date.parse(
    /^\d{4}-\d{2}-\d{2} /.test(timestamp)
      ? `${timestamp.replace(" ", "T")}Z`
      : timestamp,
  );
  if (Number.isNaN(ms)) return timestamp;
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function HistoryCard({
  history,
  activeScanId,
  onOpenScan,
  onDelete,
}: {
  history: HistoryEntry[];
  activeScanId: string | null;
  onOpenScan: (scanId: string) => void;
  onDelete: (scanId: string) => void;
}) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-1 p-4">
        <div className="flex items-center gap-2 px-1 pb-2">
          <Clock className="size-4 text-base-content/40" />
          <h2 className="text-sm font-semibold">Recent scans</h2>
        </div>
        <div className="divide-y divide-base-200">
          {history.map((scan) => (
            <div
              key={scan.scanId}
              className={`group flex w-full items-center gap-2 rounded-[3px] px-2 py-1 transition-colors hover:bg-base-200/60 ${
                scan.scanId === activeScanId ? "bg-base-200/80" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenScan(scan.scanId)}
                className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {scan.seed}
                  </span>
                  <span className="block truncate text-xs text-base-content/50">
                    {scan.questionCount ?? 0} questions · {scan.region}
                  </span>
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-base-content/50">
                  {formatScanDate(scan.createdAt)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove scan for ${scan.seed}`}
                title="Remove from history"
                onClick={() => onDelete(scan.scanId)}
                className="btn btn-ghost btn-xs px-1.5 text-base-content/35 hover:text-error"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
