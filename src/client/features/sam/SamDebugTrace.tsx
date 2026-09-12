/* eslint-disable max-lines */
import { memo, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  Loader2,
  Radio,
  X,
} from "lucide-react";
import {
  reduceTraceFrame,
  type ProviderCallView,
  type TraceFilter,
  type TraceToolView,
  type TraceTurnSummary,
  type TraceViewState,
} from "./samTraceReducer";
import {
  errorClassLabel,
  failureReasonFor,
  filterTraceTools,
  formatProviderBreakdown,
  providerDisplayLabel,
  providerStatusLine,
} from "./samTraceFormat";
import type { SamTraceFrame } from "@/shared/samToolTraceTypes";
import type { DataforseoCallDiagnostics } from "@/server/lib/dataforseo/shared";

// SAM Debug Trace panel (Phase DT) — developer-only observability for the
// tool-call lifecycle. Collapsible; hidden entirely in production builds
// unless the (safe) debug flag opts in. The panel renders a REDUCED snapshot
// of the current turn's trace events: model attempts vs handler executions
// vs provider calls, retry/gate decisions, fallbacks, and cache outcomes.

const FILTERS: TraceFilter[] = [
  "all",
  "errors",
  "blocked",
  "retries",
  "fallbacks",
];

const EMPTY_STATE: TraceViewState = {
  turnId: null,
  ai: { provider: "", model: null },
  tools: [],
  summary: {
    toolLifecycles: 0,
    uniqueTools: 0,
    blocked: 0,
    errors402: 0,
    errors429: 0,
    errors5xx: 0,
    retries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    fallbacks: 0,
    succeeded: 0,
    failed: 0,
  },
};

// ─── Sub-components (memoized — the trace re-renders on every flush) ────────

/**
 * Sanitized DataForSEO request metadata as one compact line:
 * "powersiment.ae · loc 2784 · lang ar" (only fields actually present).
 */
function formatDataforseoRequest(
  request: NonNullable<DataforseoCallDiagnostics["request"]> | undefined,
): string | null {
  if (!request) return null;
  const parts: string[] = [];
  if (request.target) parts.push(request.target);
  if (typeof request.locationCode === "number") {
    parts.push(
      `loc ${request.locationCode}${request.locationName ? ` (${request.locationName})` : ""}`,
    );
  } else if (request.locationName) {
    parts.push(`loc ${request.locationName}`);
  }
  const lang = request.languageCode ?? request.languageName;
  if (lang) parts.push(`lang ${lang}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The expanded low-level DataForSEO diagnostics block: exact HTTP status (or
 * the transport category when no response arrived), DataForSEO application
 * status_code/status_message, endpoint, and safe request metadata. This is
 * the "WHY did DataForSEO fail" answer the Debug Trace exists to give.
 */
const DataforseoDiagnosticsBlock = memo(function DataforseoDiagnosticsBlock({
  diagnostics,
  callLabel,
}: {
  diagnostics: DataforseoCallDiagnostics;
  callLabel?: string;
}) {
  const request = formatDataforseoRequest(diagnostics.request);
  return (
    <div className="mt-1 rounded border border-base-300/70 bg-base-200/40 px-2 py-1.5 text-[11px] leading-relaxed text-base-content/65">
      {callLabel ? (
        <div className="font-medium text-base-content/75">{callLabel}</div>
      ) : null}
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {diagnostics.endpoint ? (
          <>
            <span className="text-base-content/45">Endpoint:</span>
            <span className="break-all font-mono">{diagnostics.endpoint}</span>
          </>
        ) : null}
        <>
          <span className="text-base-content/45">HTTP:</span>
          <span className="tabular-nums">
            {typeof diagnostics.httpStatus === "number"
              ? diagnostics.httpStatus
              : "N/A (no response)"}
          </span>
        </>
        <>
          <span className="text-base-content/45">Transport:</span>
          <span>
            {diagnostics.transportError
              ? diagnostics.transportError
              : typeof diagnostics.httpStatus === "number"
                ? "HTTP"
                : "N/A"}
          </span>
        </>
        <>
          <span className="text-base-content/45">DataForSEO status:</span>
          <span className="tabular-nums">
            {typeof diagnostics.dataforseoStatus === "number"
              ? diagnostics.dataforseoStatus
              : "N/A"}
          </span>
        </>
        {diagnostics.dataforseoMessage ? (
          <>
            <span className="text-base-content/45">Message:</span>
            <span className="break-all">{diagnostics.dataforseoMessage}</span>
          </>
        ) : null}
        {request ? (
          <>
            <span className="text-base-content/45">Request:</span>
            <span className="break-all font-mono text-[10px]">{request}</span>
          </>
        ) : null}
        {diagnostics.responseShape ? (
          <>
            <span className="text-base-content/45">Response:</span>
            <span className="tabular-nums">
              {diagnostics.responseShape.tasks ?? "?"} tasks ·{" "}
              {diagnostics.responseShape.results ?? "?"} results ·{" "}
              {diagnostics.responseShape.items ?? "?"} items
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
});

const AttemptLine = memo(function AttemptLine({
  attempt,
}: {
  attempt: TraceToolView["attempts"][number];
}) {
  return (
    <div className="flex flex-col gap-0.5 border-l-2 border-base-300 pl-2 text-[11px] leading-relaxed text-base-content/60">
      <span>
        {attempt.gate === "block" ? "⛔" : "✓"} model attempt #
        {attempt.index} — gate:{" "}
        {attempt.gate === "block" ? "BLOCK" : (attempt.gate ?? "—")}
      </span>
      {attempt.gate === "block" ? (
        <span className="pl-3">
          handler=0 · provider=0
        </span>
      ) : (
        <>
          {attempt.handlerExecuted ? (
            <span className="pl-3">✓ handler executed</span>
          ) : null}
          {attempt.providerCalls.map((call, i) => (
            <span key={i} className="pl-3">
              {call.ok
                ? "✓"
                : "✕"}{" "}
              {call.provider}
              {call.ok
                ? call.durationMs !== null && call.durationMs !== undefined
                  ? ` → ${call.durationMs}ms`
                  : " → ok"
                : call.httpStatus
                  ? ` → HTTP ${call.httpStatus}`
                  : ` → ${errorClassLabel(call.errorCode)}`}
            </span>
          ))}
          {attempt.providerCalls
            .filter((call): call is ProviderCallView & { diagnostics: DataforseoCallDiagnostics } =>
              Boolean(call.diagnostics),
            )
            .map((call, i) => (
              <DataforseoDiagnosticsBlock
                key={`diag-${i}`}
                diagnostics={call.diagnostics}
                callLabel={
                  call.ok
                    ? undefined
                    : `${providerDisplayLabel(call.provider)} call${call.httpStatus ? ` (HTTP ${call.httpStatus})` : ""}`
                }
              />
            ))}
          {attempt.outcome?.kind === "success" ? (
            <span className="pl-3">
              ✓ final success
              {attempt.outcome.durationMs
                ? ` (${attempt.outcome.durationMs}ms)`
                : ""}
            </span>
          ) : null}
          {attempt.outcome?.kind === "error" ? (
            <span className="pl-3">
              ✕ failed — class={errorClassLabel(attempt.outcome.errorCode)}
              {attempt.outcome.httpStatus
                ? ` · HTTP ${attempt.outcome.httpStatus}`
                : ""}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
});

const ToolRow = memo(function ToolRow({
  tool,
  live,
}: {
  tool: TraceToolView;
  live: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = providerStatusLine(tool);
  const failed = tool.finalOk === false;
  const running = live && tool.finalOk === null && !tool.completed;
  const breakdown = useMemo(
    () => formatProviderBreakdown(tool.providerBreakdown),
    [tool.providerBreakdown],
  );
  const isDataforseo402 =
    tool.lastProviderError?.httpStatus === 402 ||
    tool.lastProviderError?.errorCode === "CREDITS_UNAVAILABLE" ||
    tool.attempts.some(
      (a) =>
        a.providerCalls.some(
          (c) => c.httpStatus === 402 || c.errorCode === "CREDITS_UNAVAILABLE",
        ) ||
        (a.outcome?.kind === "error" &&
          (a.outcome.httpStatus === 402 ||
            a.outcome.errorCode === "CREDITS_UNAVAILABLE")),
    );
  // Curated reason for provider-specific failure classes (today: only the
  // DataForSEO access-paused restriction carries one).
  const failureReason = failureReasonFor(tool.lastProviderError?.errorCode);

  return (
    <div className="rounded-md bg-base-200/60 px-2.5 py-2">
      <button
        type="button"
        className="flex w-full items-start gap-1.5 text-left"
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="mt-0.5 shrink-0">
          {expanded ? (
            <ChevronDown className="size-3 text-base-content/40" />
          ) : (
            <ChevronRight className="size-3 text-base-content/40" />
          )}
        </span>
        <span
          className={`shrink-0 ${failed ? "text-warning" : running ? "text-base-content/50" : "text-success"}`}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : failed ? (
            <AlertTriangle className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block break-all text-xs font-medium ${
              failed ? "text-warning" : "text-base-content/85"
            }`}
          >
            {tool.toolName}
          </span>
          {status ? (
            <span className="block break-all text-[11px] text-base-content/55">
              {status}
            </span>
          ) : null}
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-base-content/50">
            <span>
              Handler: {tool.handlerExecutions} · Provider calls:{" "}
              {tool.providerCalls}
              {tool.providerBreakdown.length === 1
                ? ` (${providerDisplayLabel(tool.providerBreakdown[0].provider)})`
                : ""}
            </span>
            {tool.providerBreakdown.length > 1 && breakdown ? (
              <span className="text-base-content/60">
                Providers: {breakdown}
              </span>
            ) : null}
            {tool.retryScheduled || tool.retriesExecuted > 0 ? (
              <span>
                Retry: {tool.retryScheduled ? "YES" : "NO"}
                {tool.retriesExecuted > 0
                  ? ` (executed ${tool.retriesExecuted})`
                  : ""}
              </span>
            ) : (
              <span>Retry: NO</span>
            )}
            {tool.blockedRetries > 0 ? (
              <span className="text-warning/80">
                Blocked retries: {tool.blockedRetries}
              </span>
            ) : null}
            {tool.fallback ? (
              <span className="text-info/80">Fallback → {tool.fallback}</span>
            ) : null}
            {tool.dedupCache ? (
              <span>Cache(dedup): {tool.dedupCache.toUpperCase()}</span>
            ) : null}
            {tool.seoCache && tool.seoCache.hits > 0 ? (
              <span>Cache(data): HIT</span>
            ) : null}
          </span>
        </span>
        {tool.durationMs !== null && !failed ? (
          <span className="shrink-0 text-[11px] tabular-nums text-base-content/40">
            {tool.durationMs}ms
          </span>
        ) : null}
      </button>
      {isDataforseo402 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded bg-warning/10 px-2 py-1 text-[11px] text-warning">
          <span className="flex items-center gap-1 font-medium">
            <AlertTriangle className="size-3 shrink-0" />
            DataForSEO credits unavailable
          </span>
          <a
            href="/settings#dataforseo"
            className="link link-warning font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Manage DataForSEO
          </a>
        </div>
      ) : null}
      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-base-300/60 pt-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-base-content/60">
            <span>Model attempts: {tool.modelAttempts}</span>
            <span>Handler executions: {tool.handlerExecutions}</span>
            <span>Provider calls: {tool.providerCalls}</span>
            <span>Blocked: {tool.blockedRetries}</span>
            {tool.seoCache ? (
              <span>
                Data cache: {tool.seoCache.hits} hit / {tool.seoCache.misses} miss
                / {tool.seoCache.writes} write
              </span>
            ) : null}
          </div>
          {tool.providerBreakdown.length > 1 ? (
            <div className="text-[11px] text-base-content/60">
              Provider breakdown: {breakdown}
            </div>
          ) : null}
          {/* Exact low-level cause of the last DataForSEO failure, even when
              the attempt timeline is hard to scan: endpoint, HTTP vs
              transport, DataForSEO application status, safe request metadata. */}
          {tool.lastProviderError?.provider === "dataforseo" &&
          tool.lastProviderError.diagnostics ? (
            <DataforseoDiagnosticsBlock
              diagnostics={tool.lastProviderError.diagnostics}
            />
          ) : null}
          {/* Normalized failure status + curated reason for provider-specific
              failure classes (e.g. DATAFORSEO_ACCESS_PAUSED). */}
          {failureReason ? (
            <div className="space-y-0.5 text-[11px] leading-relaxed text-base-content/60">
              <div>
                <span className="font-medium">Status:</span>{" "}
                {errorClassLabel(tool.lastProviderError?.errorCode)}
              </div>
              <div>
                <span className="font-medium">Reason:</span> {failureReason}
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            {tool.attempts.map((attempt) => (
              <AttemptLine key={attempt.index} attempt={attempt} />
            ))}
          </div>
          {tool.fallback ? (
            <div className="text-[11px] text-base-content/60">
              <span className="font-medium">Fallback:</span> {tool.fallback}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const TurnSummary = memo(function TurnSummary({
  summary,
}: {
  summary: TraceTurnSummary;
}) {
  return (
    <div className="space-y-0.5 border-t border-base-300 px-3 py-2 text-[11px] leading-relaxed text-base-content/60">
      <div>
        Turn: {summary.toolLifecycles} tools / {summary.uniqueTools} unique /{" "}
        {summary.blocked} blocked
      </div>
      <div className="tabular-nums">
        402: {summary.errors402} | 429: {summary.errors429} | 5xx:{" "}
        {summary.errors5xx} | Retries: {summary.retries}
      </div>
      <div className="tabular-nums">
        Cache {summary.cacheHits} hit / {summary.cacheMisses} miss · Fallbacks:{" "}
        {summary.fallbacks} · Ok: {summary.succeeded} · Failed: {summary.failed}
      </div>
      {summary.errors402 > 0 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded bg-warning/10 px-2 py-1 text-[11px] text-warning">
          <span className="flex items-center gap-1 font-medium">
            <AlertTriangle className="size-3 shrink-0" />
            DataForSEO credits unavailable
          </span>
          <a
            href="/settings#dataforseo"
            className="link link-warning font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Manage DataForSEO
          </a>
        </div>
      ) : null}
    </div>
  );
});

// ─── Panel ─────────────────────────────────────────────────────────────────

export function SamDebugTrace({
  frame,
  live,
  onClose,
  onClear,
}: {
  /** The current authoritative trace frame (owned by the conversation, survives panel toggling). */
  frame: SamTraceFrame | null;
  live: boolean;
  /** [×] — hide the panel. Trace state is preserved when re-opened. */
  onClose: () => void;
  /** Clear trace (local view only). */
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<TraceFilter>("all");

  const view = useMemo(
    () => (frame ? reduceTraceFrame(frame) : EMPTY_STATE),
    [frame],
  );
  const tools = useMemo(
    () => filterTraceTools(view.tools, filter),
    [view.tools, filter],
  );

  const hasTools = view.tools.length > 0;
  const canClear = hasTools || Boolean(view.ai.provider) || frame !== null;

  return (
    <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-base-300 bg-base-200/60 px-3 py-2">
        <Radio className="size-3.5 shrink-0 text-base-content/50" />
        <span className="flex-1 truncate text-xs font-semibold tracking-wide text-base-content/80">
          SAM Debug Trace
        </span>
        <button
          type="button"
          title="Clear trace (local view only)"
          className="btn btn-ghost btn-xs btn-square"
          onClick={onClear}
          disabled={!canClear}
        >
          <Eraser className="size-3" />
        </button>
        <button
          type="button"
          title={open ? "Collapse" : "Expand"}
          className="btn btn-ghost btn-xs btn-square"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>
        <button
          type="button"
          title="Close"
          className="btn btn-ghost btn-xs btn-square"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {open ? (
        <>
          {/* AI provider header — distinct from data providers below */}
          <div className="border-b border-base-300 px-3 py-1.5 text-[11px] text-base-content/70">
            AI:{" "}
            <span className="font-medium">
              {view.ai.provider || "resolving…"}
            </span>
            {" / "}
            <span className="break-all">
              {view.ai.model ?? "model unavailable"}
            </span>
          </div>

          {/* Filters */}
          <div className="flex gap-1 border-b border-base-300 px-2 py-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`rounded px-1.5 py-0.5 text-[10px] capitalize transition-colors ${
                  filter === f
                    ? "bg-primary/15 text-primary"
                    : "text-base-content/50 hover:bg-base-200"
                }`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Tool rows */}
          <div className="max-h-[45vh] space-y-1.5 overflow-y-auto px-2 py-2">
            {tools.length === 0 ? (
              <div className="px-1.5 py-3 text-center text-[11px] text-base-content/40">
                {hasTools
                  ? "No tools match this filter"
                  : "No tool activity this turn yet"}
              </div>
            ) : (
              tools.map((tool) => (
                <ToolRow key={tool.toolName} tool={tool} live={live} />
              ))
            )}
          </div>

          {/* Turn summary */}
          {hasTools ? <TurnSummary summary={view.summary} /> : null}
        </>
      ) : (
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-base-content/50">
          <span>
            {hasTools
              ? `${view.summary.toolLifecycles} tools · ${view.summary.blocked} blocked`
              : "No trace yet"}
          </span>
          {view.summary.errors402 > 0 ? (
            <span className="flex items-center gap-1 text-warning/80">
              <Ban className="size-3" /> 402: {view.summary.errors402}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const SamDebugTracePanel = memo(SamDebugTrace);
