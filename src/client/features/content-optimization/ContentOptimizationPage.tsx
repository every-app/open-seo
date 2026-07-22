import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteContentScan,
  getContentOptimizationStatus,
  getContentScanView,
  listContentScans,
  startContentScan,
} from "@/serverFunctions/contentOptimization";
import {
  CONTENT_SCAN_REGIONS,
  type ContentScanRegion,
} from "@/shared/content-optimization";
import { ContentScanReport } from "./ContentScanReport";
import { ConnectOnPageCard, ModuleDisabledCard } from "./ConnectOnPageCard";
import { ScanProgressCard } from "./ScanProgressCard";

const RUNNING_STATUSES = new Set([
  "queued",
  "waiting",
  "running",
  "processing",
]);
const POLL_INTERVAL_MS = 4_000;

export function ContentOptimizationPage({
  projectId,
  jobId,
  onOpenScan,
}: {
  projectId: string;
  jobId: string | null;
  onOpenScan: (jobId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState<ContentScanRegion>("US");
  // The scan bar doubles as the open report's context: when a scan is loaded,
  // its url/keyword/region populate the inputs (once per jobId, so edits for
  // the next scan are never clobbered).
  const [syncedJobId, setSyncedJobId] = useState<string | null>(null);
  // Scans started in this session, so the staged progress card only shows for
  // work that is actually running; reopening a stored report costs nothing
  // and gets a plain loading spinner instead.
  const [startedJobIds] = useState(() => new Set<string>());

  const { data: connection } = useQuery({
    queryKey: ["contentOptimizationModule"],
    queryFn: () => getContentOptimizationStatus(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: history } = useQuery({
    queryKey: ["contentScanHistory", projectId],
    queryFn: () => listContentScans({ data: { projectId } }),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      startContentScan({
        data: { projectId, url: normalizeUrl(url), keyword, region },
      }),
    onSuccess: (started) => {
      startedJobIds.add(started.jobId);
      void queryClient.invalidateQueries({
        queryKey: ["contentScanHistory", projectId],
      });
      onOpenScan(started.jobId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (target: string) =>
      deleteContentScan({ data: { projectId, jobId: target } }),
    onSuccess: (_data, target) => {
      void queryClient.invalidateQueries({
        queryKey: ["contentScanHistory", projectId],
      });
      if (target === jobId) onOpenScan(null);
      toast.success("Scan removed from history.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: view } = useQuery({
    queryKey: ["contentScanView", projectId, jobId],
    queryFn: () => getContentScanView({ data: { projectId, jobId: jobId! } }),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === undefined || RUNNING_STATUSES.has(s)
        ? POLL_INTERVAL_MS
        : false;
    },
    // Scans take minutes; keep polling while the user reads another tab.
    refetchIntervalInBackground: true,
  });

  const historyEntry =
    jobId === null ? undefined : history?.find((h) => h.jobId === jobId);

  useEffect(() => {
    if (jobId === null || jobId === syncedJobId) return;
    if (historyEntry !== undefined) {
      setUrl(historyEntry.url);
      setKeyword(historyEntry.keyword);
      const known = CONTENT_SCAN_REGIONS.find(
        (code) => code === historyEntry.region,
      );
      if (known) setRegion(known);
      setSyncedJobId(jobId);
      return;
    }
    if (view?.status === "completed") {
      if (view.report.meta.url) setUrl(view.report.meta.url);
      if (view.report.meta.target_keyword) {
        setKeyword(view.report.meta.target_keyword);
      }
      setSyncedJobId(jobId);
    }
  }, [jobId, syncedJobId, historyEntry, view]);

  // A scan is in flight when we started it this session (show progress from
  // the first render) or when the provider reports it still running. A view
  // still loading for a scan we did not start is just a stored-report fetch.
  const isRunning =
    startMutation.isPending ||
    (jobId !== null &&
      (startedJobIds.has(jobId)
        ? view === undefined || RUNNING_STATUSES.has(view.status)
        : view !== undefined && RUNNING_STATUSES.has(view.status)));
  const isLoadingStored = jobId !== null && view === undefined && !isRunning;

  const onRegionChange = (value: string) => {
    const next = CONTENT_SCAN_REGIONS.find((code) => code === value);
    if (next) setRegion(next);
  };

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">Content Optimization</h1>
          <p className="text-sm text-base-content/70">
            Scan a page against the live SERP for a keyword: entity coverage,
            structural benchmarks, and term gaps versus what actually ranks.
          </p>
        </div>

        {connection && !connection.enabled ? (
          <ModuleDisabledCard />
        ) : connection && !connection.configured ? (
          <ConnectOnPageCard />
        ) : (
          <>
            {connection && connection.configured && !connection.ok && (
              <div className="alert alert-warning text-sm">
                {connection.message ??
                  "The On-Page.ai connection could not be verified."}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isRunning) return;
                if (url.trim().length === 0 || keyword.trim().length === 0) {
                  toast.error("Enter a page URL and a target keyword to scan.");
                  return;
                }
                startMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="card flex flex-col border border-base-300 bg-base-100 p-[7px] sm:flex-row sm:items-stretch">
                  <input
                    className="min-w-0 flex-[2] rounded-[6px] bg-transparent px-4 py-3 text-[15px] outline-none transition-shadow placeholder:text-base-content/35 focus:ring-2 focus:ring-primary/50"
                    placeholder="https://example.com/page"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <div className="my-[9px] hidden w-px bg-base-300 sm:block" />
                  <input
                    className="min-w-0 flex-[1.3] rounded-[6px] bg-transparent px-4 py-3 text-[15px] outline-none transition-shadow placeholder:text-base-content/35 focus:ring-2 focus:ring-primary/50"
                    placeholder="Target keyword"
                    maxLength={150}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <div className="my-[9px] hidden w-px bg-base-300 sm:block" />
                  <select
                    className="cursor-pointer rounded-[6px] bg-transparent px-4 py-3 text-[15px] outline-none transition-shadow focus:ring-2 focus:ring-primary/50"
                    value={region}
                    onChange={(e) => onRegionChange(e.target.value)}
                  >
                    {CONTENT_SCAN_REGIONS.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary mx-1.5 self-center px-7"
                    type="submit"
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ScanSearch className="size-4" />
                    )}
                    Scan
                  </button>
                </div>
                <p className="px-1 text-[13px] text-base-content/45">
                  Scans usually finish in 30 seconds to 3 minutes. Uses scan
                  credits from your On-Page.ai account.
                </p>
              </div>
            </form>

            {jobId !== null && isRunning && (
              <ScanProgressCard
                progress={
                  view !== undefined && "progress" in view
                    ? (view.progress ?? null)
                    : null
                }
              />
            )}

            {isLoadingStored && (
              <div className="flex justify-center py-10">
                <span className="loading loading-spinner loading-md" />
              </div>
            )}

            {(view?.status === "failed" || view?.status === "cancelled") && (
              <div className="alert alert-error text-sm">
                {view.error?.message ?? "The scan failed. Please try again."}
              </div>
            )}

            {view?.status === "completed" && (
              <ContentScanReport
                report={view.report}
                pageCategory={view.pageCategory}
              />
            )}

            {jobId === null &&
              (history === undefined || history.length === 0) && (
                <div className="card border border-dashed border-base-300 bg-base-100">
                  <div className="card-body items-center gap-2 p-10 text-center">
                    <div className="flex size-10 items-center justify-center rounded-[3px] bg-base-200">
                      <ScanSearch className="size-5 text-base-content/40" />
                    </div>
                    <p className="text-sm font-medium text-base-content/70">
                      Run your first content scan
                    </p>
                    <p className="max-w-sm text-xs text-base-content/40">
                      Point it at any page and keyword to see entity gaps,
                      structure benchmarks, and what the ranking pages cover
                      that this one does not.
                    </p>
                  </div>
                </div>
              )}

            {history !== undefined && history.length > 0 && (
              <HistoryCard
                history={history}
                activeJobId={jobId}
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

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// ─── History ─────────────────────────────────────────────────────────────────

type HistoryEntry = {
  jobId: string;
  url: string;
  keyword: string;
  region: string;
  score: number | null;
  grade: string | null;
  createdAt: string;
};

function scorePill(score: number | null): string {
  if (score === null) return "border-base-300 bg-base-200 text-base-content/50";
  if (score >= 80) return "border-success/25 bg-success/10 text-success";
  if (score >= 60) return "border-primary/25 bg-primary/10 text-primary";
  if (score >= 40) return "border-warning/30 bg-warning/10 text-warning";
  return "border-error/30 bg-error/10 text-error";
}

// SQLite's current_timestamp has no timezone marker; treat it as UTC so the
// shown date never shifts with the browser timezone (same convention as #94).
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
  activeJobId,
  onOpenScan,
  onDelete,
}: {
  history: HistoryEntry[];
  activeJobId: string | null;
  onOpenScan: (jobId: string) => void;
  onDelete: (jobId: string) => void;
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
              key={scan.jobId}
              className={`group flex w-full items-center gap-2 rounded-[3px] px-2 py-1 transition-colors hover:bg-base-200/60 ${
                scan.jobId === activeJobId ? "bg-base-200/80" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenScan(scan.jobId)}
                className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
              >
                <span
                  className={`w-12 shrink-0 rounded-[3px] border px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${scorePill(scan.score)}`}
                >
                  {scan.score ?? "…"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {scan.keyword}
                  </span>
                  <span className="block truncate text-xs text-base-content/50">
                    {scan.url}
                  </span>
                </span>
                <span className="shrink-0 rounded-[3px] bg-base-200 px-2 py-0.5 text-[11px] font-medium text-base-content/60">
                  {scan.region}
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-base-content/50">
                  {formatScanDate(scan.createdAt)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove scan for ${scan.keyword}`}
                title="Remove from history"
                onClick={() => onDelete(scan.jobId)}
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
