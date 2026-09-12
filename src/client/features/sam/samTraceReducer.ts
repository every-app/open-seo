// SAM Debug Trace — pure state reduction + selection (Phase DT).
//
// The client consumes full-turn trace snapshots from the DO (a `sam_trace`
// WS frame). This module turns the current snapshot into the panel's view
// model with zero React: group events per tool lifecycle, compute counters,
// classify statuses, and apply filters. Both it and the reducer are unit-
// tested directly; the component is a thin memoized renderer.
//
// The events arrive as a bounded, pre-sanitized snapshot (the bus caps the
// turn at MAX_EVENTS_PER_TURN and scrubs credential shapes), so this module's
// memory is bounded by the snapshot size — no client-side accumulation.

/* eslint-disable max-lines */

import type { SamTraceFrame } from "@/shared/samToolTraceTypes";
import type { DataforseoCallDiagnostics } from "@/server/lib/dataforseo/shared";
import { diagnosticsOf } from "./samTraceFormat";

// ─── View model ─────────────────────────────────────────────────────────────

export type TraceAttemptView = {
  /** 1-based attempt number within the tool lifecycle. */
  index: number;
  /** True when this attempt executed a real handler. */
  handlerExecuted: boolean;
  /** True when a provider/network call was made. */
  providerCalled: boolean;
  /** "allow" | "block" — the recovery gate decision for this attempt. */
  gate: "allow" | "block" | null;
  /** Provider executions in this attempt (with per-call outcome). */
  providerCalls: ProviderCallView[];
  /** Terminal outcome of this attempt, if reached. */
  outcome:
    | null
    | { kind: "success"; durationMs: number | null }
    | { kind: "error"; errorCode?: string; httpStatus?: number | null }
    | { kind: "blocked"; errorCode?: string };
};

export type ProviderCallView = {
  provider: string;
  ok: boolean;
  httpStatus?: number | null;
  errorCode?: string;
  durationMs?: number | null;
  /**
   * Sanitized DataForSEO diagnostics when this call was a DataForSEO
   * execution that failed (or succeeded with a shape worth showing):
   * endpoint, transport category, application status, safe request metadata.
   */
  diagnostics?: DataforseoCallDiagnostics;
};

/** Per-provider call counts, first-seen execution order (provider-request events only). */
export type ProviderBreakdownEntry = {
  /** Canonical provider id as the runtime event carried it ("dataforseo"). */
  provider: string;
  /** Number of actual provider execution attempts. */
  calls: number;
};

export type TraceToolView = {
  toolName: string;
  /** Document order of first appearance. */
  order: number;
  /** Total model attempts for this tool (entries into the guarded runner). */
  modelAttempts: number;
  /** Real handler executions (attempts that ran the handler). */
  handlerExecutions: number;
  /** Provider/network calls observed. */
  providerCalls: number;
  /**
   * Per-provider execution counts in first-seen order. Derived exclusively
   * from provider_request events (one request = one call), so it always
   * sums exactly to providerCalls. Cache hits, gate blocks, model
   * attempts, and fallback hints never enter it.
   */
  providerBreakdown: ProviderBreakdownEntry[];
  /** Attempts the recovery gate blocked (model retries prevented). */
  blockedRetries: number;
  /** Automatic retries executed (retryable classes). */
  retriesExecuted: number;
  /** Whether an automatic retry was scheduled at all. */
  retryScheduled: boolean;
  /** Whether the final state of the last real attempt was success. */
  finalOk: boolean | null;
  /** Last provider identity that produced an outcome (for the summary row). */
  lastProvider: string | null;
  /** Last provider error (for the summary row's status line). */
  lastProviderError: {
    provider: string;
    httpStatus?: number | null;
    errorCode?: string;
    diagnostics?: DataforseoCallDiagnostics;
  } | null;
  /** Last measured duration for a successful/failed lifecycle. */
  durationMs: number | null;
  /** Dedup-cache outcome within the guarded runner. */
  dedupCache: "hit" | "miss" | null;
  /** SEO-data cache outcome from the router. */
  seoCache: { hits: number; misses: number; writes: number } | null;
  /** Fallback sources selected at runtime (from recovery hints). */
  fallback: string | null;
  /** Attempt timelines, in order. */
  attempts: TraceAttemptView[];
  /** Final completion event's state marker. */
  completed: boolean;
};

export type TraceTurnSummary = {
  toolLifecycles: number;
  uniqueTools: number;
  blocked: number;
  errors402: number;
  errors429: number;
  errors5xx: number;
  retries: number;
  cacheHits: number;
  cacheMisses: number;
  fallbacks: number;
  succeeded: number;
  failed: number;
};

export type TraceFilter = "all" | "errors" | "blocked" | "retries" | "fallbacks";

export type TraceViewState = {
  turnId: string | null;
  ai: { provider: string; model: string | null };
  tools: TraceToolView[];
  summary: TraceTurnSummary;
};

// ─── Accumulator (internal) ─────────────────────────────────────────────────

type ToolAccumulator = {
  view: TraceToolView;
  active: TraceAttemptView | null;
};

function newAttempt(index: number): TraceAttemptView {
  return {
    index,
    handlerExecuted: false,
    providerCalled: false,
    gate: null,
    providerCalls: [],
    outcome: null,
  };
}

function newToolView(toolName: string, order: number): TraceToolView {
  return {
    toolName,
    order,
    modelAttempts: 0,
    handlerExecutions: 0,
    providerCalls: 0,
    providerBreakdown: [],
    blockedRetries: 0,
    retriesExecuted: 0,
    retryScheduled: false,
    finalOk: null,
    lastProvider: null,
    lastProviderError: null,
    durationMs: null,
    dedupCache: null,
    seoCache: null,
    fallback: null,
    attempts: [],
    completed: false,
  };
}

function ensureSeoCache(view: TraceToolView) {
  if (!view.seoCache) view.seoCache = { hits: 0, misses: 0, writes: 0 };
  return view.seoCache;
}

/** Close the open attempt, resolving its blocked outcome, if any. */
function sealAttempt(acc: ToolAccumulator): void {
  if (!acc.active) return;
  const { active } = acc;
  if (active.outcome === null && active.gate === "block") {
    active.outcome = { kind: "blocked" };
  }
  if (active.gate !== null || active.handlerExecuted) {
    acc.view.attempts.push(active);
  }
  acc.active = null;
}

/** Find this attempt's most recent unresolved provider call (to fill in). */
function openProviderCall(attempt: TraceAttemptView): ProviderCallView | null {
  for (let i = attempt.providerCalls.length - 1; i >= 0; i--) {
    const call = attempt.providerCalls[i];
    if (call.durationMs === null || call.durationMs === undefined) return call;
  }
  return null;
}

/**
 * Find the unresolved call for one provider error: prefer the most recent
 * open call from the SAME provider (the runner emits a single classified
 * provider_error after the router tried fallbacks, so the last open call
 * may belong to a fallback provider that never resolved).
 */
function openProviderCallFor(
  attempt: TraceAttemptView,
  provider: string | undefined,
): ProviderCallView | null {
  if (provider) {
    for (let i = attempt.providerCalls.length - 1; i >= 0; i--) {
      const call = attempt.providerCalls[i];
      if (
        call.provider === provider &&
        (call.durationMs === null || call.durationMs === undefined)
      ) {
        return call;
      }
    }
  }
  return openProviderCall(attempt);
}

// ─── Per-event application ──────────────────────────────────────────────────
// Each handler mutates the accumulator; the main loop below stays a flat
// dispatch (complexity budget) while each handler owns one lifecycle rule.

function applyModelAttempt(acc: ToolAccumulator): void {
  // A new model attempt opens a new attempt timeline entry. If a previous
  // attempt was still open (its tool_completed never arrived — snapshots can
  // be mid-flight), seal it first.
  sealAttempt(acc);
  acc.view.modelAttempts += 1;
  acc.active = newAttempt(acc.view.modelAttempts);
}

function applyGate(acc: ToolAccumulator, blocked: boolean): void {
  if (blocked) {
    acc.view.blockedRetries += 1;
    if (!acc.active) {
      acc.view.modelAttempts += 1;
      acc.active = newAttempt(acc.view.modelAttempts);
    }
    acc.active.gate = "block";
    sealAttempt(acc);
  } else if (acc.active) {
    acc.active.gate = "allow";
  }
}

function applyHandlerStart(acc: ToolAccumulator): void {
  if (!acc.active) {
    // A handler running outside a model-attempt context: an automatic retry
    // (its attempt index continues the timeline) or a defensive stray.
    const lastIndex =
      acc.view.attempts.length > 0
        ? acc.view.attempts[acc.view.attempts.length - 1]?.index ?? 0
        : 0;
    acc.active = newAttempt(Math.max(lastIndex + 1, acc.view.modelAttempts || 1));
  }
  acc.active.handlerExecuted = true;
  acc.view.handlerExecutions += 1;
}

function applyProviderRequest(acc: ToolAccumulator, provider?: string): void {
  if (acc.active) {
    acc.active.providerCalled = true;
    acc.active.providerCalls.push({
      provider: provider ?? "unknown",
      ok: true,
      durationMs: null,
    });
  }
  acc.view.providerCalls += 1;
  // Breakdown counts actual provider execution attempts (provider_request),
  // keyed on the canonical id, in first-seen order — never cache hits, gate
  // blocks, or fallback hints.
  const id = provider ?? "unknown";
  const entry = acc.view.providerBreakdown.find((e) => e.provider === id);
  if (entry) entry.calls += 1;
  else acc.view.providerBreakdown.push({ provider: id, calls: 1 });
  if (provider) acc.view.lastProvider = provider;
}

function applyProviderSuccess(
  acc: ToolAccumulator,
  provider: string | undefined,
  durationMs: number | undefined,
  metadata: Record<string, unknown> | undefined,
): void {
  if (acc.active) {
    const call = openProviderCall(acc.active);
    const diagnostics = diagnosticsOf(provider, metadata);
    if (call) {
      call.ok = true;
      call.durationMs = durationMs ?? null;
      // A DataForSEO success may carry safe response-shape metadata; merge it
      // into the open call's diagnostics record.
      if (diagnostics) call.diagnostics = diagnostics;
    } else {
      acc.active.providerCalls.push({
        provider: provider ?? "unknown",
        ok: true,
        durationMs: durationMs ?? null,
        ...(diagnostics ? { diagnostics } : {}),
      });
    }
  }
  if (provider) acc.view.lastProvider = provider;
}

function applyProviderError(
  acc: ToolAccumulator,
  summary: TraceTurnSummary,
  event: {
    provider?: string;
    httpStatus?: number;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  },
): void {
  const { provider, httpStatus, errorCode, metadata } = event;
  const diagnostics = diagnosticsOf(provider, metadata);
  // The DataForSEO seam (transport/HTTP failure point) and the guarded
  // runner (classification) can both emit provider_error for the SAME
  // provider call — merge them into one entry, and count the failure into
  // the turn summary only once (the first event that marks the entry failed).
  const resolvedHttpStatus =
    httpStatus ??
    (typeof diagnostics?.httpStatus === "number"
      ? diagnostics.httpStatus
      : undefined);
  const errorInfo = {
    provider: provider ?? acc.view.lastProvider ?? "unknown",
    httpStatus: resolvedHttpStatus ?? null,
    errorCode,
    ...(diagnostics ? { diagnostics } : {}),
  };
  let counted = false;
  if (acc.active) {
    acc.active.providerCalled = true;
    const call = openProviderCallFor(acc.active, errorInfo.provider);
    if (call) {
      // Count the failure into the summary only on the FIRST event that
      // marks this entry failed (the seam's provider_error and the runner's
      // classified one both fire for one DataForSEO call).
      counted = call.ok;
      call.ok = false;
      call.errorCode = errorCode ?? call.errorCode;
      if (resolvedHttpStatus != null) call.httpStatus = resolvedHttpStatus;
      else if (call.httpStatus == null && diagnostics?.httpStatus != null) {
        call.httpStatus = diagnostics.httpStatus;
      }
      // Merge the seam's sanitized diagnostics into the call entry.
      if (diagnostics) call.diagnostics = { ...call.diagnostics, ...diagnostics };
    } else {
      counted = true;
      acc.active.providerCalls.push({ ...errorInfo, ok: false });
    }
    if (acc.active.outcome === null) {
      acc.active.outcome = {
        kind: "error",
        errorCode,
        httpStatus: resolvedHttpStatus ?? null,
      };
    }
  } else {
    counted = true;
  }
  acc.view.lastProvider = errorInfo.provider;
  acc.view.lastProviderError = {
    provider: errorInfo.provider,
    httpStatus: errorInfo.httpStatus,
    errorCode: errorInfo.errorCode,
    // Merge, never overwrite: the seam's event (with the exact diagnostics)
    // can arrive before the runner's classified event (without them) — the
    // diagnostics must survive the later event.
    diagnostics: {
      ...acc.view.lastProviderError?.diagnostics,
      ...diagnostics,
    },
  };
  if (!counted) return;
  if (resolvedHttpStatus === 402) summary.errors402 += 1;
  else if (resolvedHttpStatus === 429) summary.errors429 += 1;
  else if (resolvedHttpStatus !== undefined && resolvedHttpStatus >= 500) {
    summary.errors5xx += 1;
  }
}

function applyHandlerTerminal(
  acc: ToolAccumulator,
  ok: boolean,
  durationMs: number | undefined,
  errorCode: string | undefined,
  httpStatus: number | undefined,
): void {
  // handler_success / handler_error: stamp the open attempt's outcome (this
  // attempt's terminal), seal it, and set the lifecycle's final direction. A
  // later success in the same lifecycle (post-retry) overwrites an earlier
  // failure — the LAST terminal decides the tool's final state.
  if (acc.active) {
    acc.active.outcome = ok
      ? { kind: "success", durationMs: durationMs ?? null }
      : { kind: "error", errorCode, httpStatus: httpStatus ?? null };
  }
  sealAttempt(acc);
  acc.view.finalOk = ok;
  if (durationMs !== undefined) acc.view.durationMs = durationMs;
}

function applyToolCompleted(
  acc: ToolAccumulator,
  durationMs: number | undefined,
  errorCode: string | undefined,
  blocked: boolean | undefined,
  cacheHit: boolean | undefined,
): void {
  // tool_completed: the lifecycle's end marker. Seals any open attempt and
  // resolves finalOk (blocked/failed completions never read as success).
  sealAttempt(acc);
  acc.view.completed = true;
  if (blocked || errorCode) {
    acc.view.finalOk = false;
  } else if (cacheHit || !errorCode) {
    acc.view.finalOk = true;
  }
  if (durationMs !== undefined) acc.view.durationMs = durationMs;
}

// ─── Main reduction ─────────────────────────────────────────────────────────

/**
 * Reduce a full-turn trace snapshot into the panel view state.
 * Pure: same frame → same state (memo-friendly by reference on `frame`).
 */
export function reduceTraceFrame(frame: SamTraceFrame): TraceViewState {
  const byTool = new Map<string, ToolAccumulator>();
  let order = 0;
  const summary: TraceTurnSummary = {
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
  };

  for (const event of frame.events) {
    const toolName = event.toolName;
    if (!toolName) continue;
    let acc = byTool.get(toolName);
    if (!acc) {
      acc = { view: newToolView(toolName, order++), active: null };
      byTool.set(toolName, acc);
    }
    switch (event.event) {
      case "model_attempt":
        applyModelAttempt(acc);
        break;
      case "gate_allowed":
        applyGate(acc, false);
        break;
      case "gate_blocked":
        applyGate(acc, true);
        summary.blocked += 1;
        break;
      case "handler_start":
        applyHandlerStart(acc);
        break;
      case "retry_executed":
        acc.view.retriesExecuted += 1;
        summary.retries += 1;
        break;
      case "retry_scheduled":
        acc.view.retryScheduled = true;
        break;
      case "provider_request":
        applyProviderRequest(acc, event.provider);
        break;
      case "provider_success":
        applyProviderSuccess(
          acc,
          event.provider,
          event.durationMs,
          event.metadata,
        );
        break;
      case "provider_error":
        applyProviderError(acc, summary, {
          provider: event.provider,
          httpStatus: event.httpStatus,
          errorCode: event.errorCode,
          metadata: event.metadata,
        });
        break;
      case "handler_success":
        applyHandlerTerminal(acc, true, event.durationMs, undefined, undefined);
        break;
      case "handler_error":
        applyHandlerTerminal(
          acc,
          false,
          event.durationMs,
          event.errorCode,
          event.httpStatus,
        );
        break;
      case "cache_hit":
        summary.cacheHits += 1;
        if (event.provider === "cache") {
          ensureSeoCache(acc.view).hits += 1;
        } else {
          acc.view.dedupCache = "hit";
          acc.view.finalOk = true;
        }
        break;
      case "cache_miss":
        summary.cacheMisses += 1;
        if (event.provider === "cache") {
          ensureSeoCache(acc.view).misses += 1;
        } else {
          acc.view.dedupCache = "miss";
        }
        break;
      case "cache_write":
        ensureSeoCache(acc.view).writes += 1;
        break;
      case "fallback_selected":
        summary.fallbacks += 1;
        if (event.fallbackHint) acc.view.fallback = event.fallbackHint;
        break;
      case "tool_completed":
        applyToolCompleted(
          acc,
          event.durationMs,
          event.errorCode,
          event.blocked,
          event.cacheHit,
        );
        break;
      default:
        break;
    }
  }

  const tools: TraceToolView[] = [];
  for (const acc of byTool.values()) {
    sealAttempt(acc);
    // Final state: null only while a live attempt is still streaming.
    if (acc.view.finalOk === null && acc.view.attempts.length > 0) {
      const lastOutcome =
        acc.view.attempts[acc.view.attempts.length - 1]?.outcome ?? null;
      if (lastOutcome?.kind === "success") acc.view.finalOk = true;
      else acc.view.finalOk = false;
    }
    if (acc.view.finalOk === true) summary.succeeded += 1;
    if (acc.view.finalOk === false) summary.failed += 1;
    tools.push(acc.view);
  }

  summary.uniqueTools = tools.length;
  // "tools" in the turn line = total lifecycle activities: every blocked
  // retry or automatic retry is one more attempt activity inside a tool's
  // lifecycle. The spec's "7 tools / 5 unique / 2 blocked" maps to
  // unique + blocked + retries when those are the extra activities.
  summary.toolLifecycles =
    summary.uniqueTools + summary.blocked + summary.retries;

  return {
    turnId: frame.turnId ?? frame.events[0]?.turnId ?? null,
    ai: frame.ai,
    tools,
    summary,
  };
}

