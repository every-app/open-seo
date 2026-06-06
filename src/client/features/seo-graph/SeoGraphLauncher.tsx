'use client';

/**
 * SeoGraphLauncher — full launch form + live audit detail view
 *
 * LaunchView:
 *   - Domain input + keywords textarea
 *   - History list of past audits
 *   - Submits via useStartSeoGraphAudit → Railway FastAPI
 *
 * AuditDetail:
 *   - Progress bar driven by routingPath length
 *   - RoutingPathFeed: animated node list
 *   - SeoGraphStream: live SSE thinking blocks (while running)
 *   - SeoGraphReport: full markdown report (on completion)
 */
import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  Bot,
  ChevronRight,
  Clock,
  Loader2,
  ScanSearch,
  Trash2,
} from "lucide-react";
import {
  useStartSeoGraphAudit,
  useSeoGraphAudit,
  useSeoGraphAuditHistory,
  useDeleteSeoGraphAudit,
  parseRoutingPath,
  routingPathToProgress,
  type SeoGraphAuditRow,
} from "./useSeoGraphAudit";
import { SeoGraphStream } from "./SeoGraphStream";
import { SeoGraphReport } from "./SeoGraphReport";

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SeoGraphAuditRow["status"], string> = {
  pending: "badge-warning",
  running: "badge-info",
  completed: "badge-success",
  failed: "badge-error",
};

function StatusBadge({ status }: { status: SeoGraphAuditRow["status"] }) {
  return (
    <span className={`badge badge-sm ${STATUS_BADGE[status]}`}>
      {status === "running" && <Loader2 className="size-2.5 animate-spin mr-1" />}
      {status}
    </span>
  );
}

// ─── RoutingPathFeed ──────────────────────────────────────────────────────────

const NODE_LABELS: Record<string, string> = {
  gather_node: "Gathering agent data",
  technical_node: "Technical analysis",
  supervisor_node: "Supervisor routing",
  crawlability_fix_node: "Crawlability fix plan",
  authority_gap_node: "Authority gap analysis",
  content_gap_node: "Content gap analysis",
  strategy_node: "Strategy synthesis",
  synthesis_node: "Writing client report",
  flywheel_persist_node: "Persisting to ZIE flywheel",
};

function RoutingPathFeed({ routingPath }: { routingPath: string }) {
  const nodes = parseRoutingPath(routingPath);
  if (nodes.length === 0) return null;

  return (
    <div className="space-y-1">
      {nodes.map((node, i) => (
        <div
          key={`${node}-${i}`}
          className={`flex items-center gap-2 text-xs text-base-content/70 ${
            i === nodes.length - 1
              ? "animate-in slide-in-from-top-1 duration-300"
              : ""
          }`}
        >
          <span className="size-1.5 rounded-full bg-success shrink-0" />
          {NODE_LABELS[node] ?? node}
        </div>
      ))}
    </div>
  );
}

// ─── LaunchView ───────────────────────────────────────────────────────────────

type LaunchViewProps = {
  projectId: string;
  defaultDomain?: string;
  onAuditStarted: (auditId: string) => void;
};

export function LaunchView({ projectId, defaultDomain = "", onAuditStarted }: LaunchViewProps) {
  const [domain, setDomain] = useState(defaultDomain);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const start = useStartSeoGraphAudit(projectId);
  const history = useSeoGraphAuditHistory(projectId);
  const deleteAudit = useDeleteSeoGraphAudit(projectId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    const keywords = keywordsRaw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const result = await start.mutateAsync({ domain: domain.trim(), keywords });
    onAuditStarted(result.auditId);
  }

  return (
    <div className="space-y-6">
      {/* Launch form */}
      <div className="rounded-xl border border-base-300 bg-base-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">AI SEO Audit</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label label-text text-xs">Domain</label>
            <input
              type="text"
              placeholder="jedilabs.org"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={start.isPending}
              className="input input-bordered input-sm w-full"
            />
          </div>
          <div>
            <label className="label label-text text-xs">
              Keywords{" "}
              <span className="label-text-alt text-base-content/50">
                comma-separated, optional
              </span>
            </label>
            <input
              type="text"
              placeholder="enterprise AI solutions, LangGraph consulting"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              disabled={start.isPending}
              className="input input-bordered input-sm w-full"
            />
          </div>

          {start.error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              {start.error instanceof Error ? start.error.message : "Failed to start audit"}
            </div>
          )}

          <button
            type="submit"
            disabled={start.isPending || !domain.trim()}
            className="btn btn-primary btn-sm w-full gap-2"
          >
            {start.isPending ? (
              <><Loader2 className="size-4 animate-spin" /> Starting…</>
            ) : (
              <><ScanSearch className="size-4" /> Run LangGraph Audit</>
            )}
          </button>
        </form>

        {start.isPending && (
          <div className="mt-3 flex items-center gap-2 text-xs text-base-content/60">
            <Loader2 className="size-3.5 animate-spin" />
            Submitting to Railway FastAPI — returns run_id in &lt;50ms
          </div>
        )}
      </div>

      {/* History */}
      {history.data && history.data.length > 0 && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-6">
          <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider mb-3">
            Recent Audits
          </h3>
          <div className="space-y-2">
            {history.data.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-base-200 px-3 py-2.5 hover:bg-base-200/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onAuditStarted(row.id)}
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.domain}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="size-3 text-base-content/40" />
                      <span className="text-xs text-base-content/50">
                        {new Date(row.startedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                  <ChevronRight className="size-4 text-base-content/30 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteAudit.mutate(row.id)}
                  className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                  aria-label="Delete audit"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AuditDetail ──────────────────────────────────────────────────────────────

type AuditDetailProps = {
  projectId: string;
  auditId: string;
  onBack: () => void;
};

export function AuditDetail({ projectId, auditId, onBack }: AuditDetailProps) {
  const { data: audit, isLoading, error } = useSeoGraphAudit(projectId, auditId);
  const [liveReport, setLiveReport] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/60 p-6">
        <Loader2 className="size-4 animate-spin" />
        Loading audit…
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
        {error instanceof Error ? error.message : "Audit not found"}
      </div>
    );
  }

  const progress = routingPathToProgress(audit.routingPath);
  const isRunning = audit.status === "pending" || audit.status === "running";
  const report = audit.clientReport ?? liveReport;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-base-content/50 hover:text-base-content mb-1"
          >
            ← All audits
          </button>
          <h2 className="text-sm font-semibold">{audit.domain}</h2>
          <p className="text-xs text-base-content/50 mt-0.5">
            {new Date(audit.startedAt).toLocaleString()}
            {audit.runId && (
              <span className="ml-2 font-mono text-base-content/30">
                run: {audit.runId.slice(0, 8)}…
              </span>
            )}
          </p>
        </div>
        <StatusBadge status={audit.status} />
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-2">
          <progress
            className="progress progress-primary w-full"
            value={progress}
            max={100}
          />
          <RoutingPathFeed routingPath={audit.routingPath} />
        </div>
      )}

      {/* Completed routing path */}
      {!isRunning && parseRoutingPath(audit.routingPath).length > 0 && (
        <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-3">
          <p className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">
            Routing Path
          </p>
          <div className="flex flex-wrap gap-1.5">
            {parseRoutingPath(audit.routingPath).map((node, i) => (
              <span key={i} className="badge badge-sm badge-ghost font-mono text-xs">
                {NODE_LABELS[node] ?? node}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Live SSE stream (while running and run_id available) */}
      {isRunning && audit.runId && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            Live LangGraph Stream
          </p>
          <SeoGraphStream
            runId={audit.runId}
            onDone={(r) => setLiveReport(r)}
          />
        </div>
      )}

      {/* Error */}
      {audit.status === "failed" && audit.errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          {audit.errorMessage}
        </div>
      )}

      {/* Final report */}
      {report && (
        <SeoGraphReport domain={audit.domain} clientReport={report} />
      )}
    </div>
  );
}
