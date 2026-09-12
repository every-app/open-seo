import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolExecutionTracker } from "@/server/features/sam/samToolExecution";
import {
  buildToolBlockedMessage,
  buildToolFailureMessage,
  classifyToolError,
  retryDelayMs,
  type ClassifiedToolError,
  type ToolRecoveryState,
} from "@/server/features/sam/samToolRecovery";
import { classifyToolOutput } from "@/server/features/sam/samToolBatchOutput";
import { fallbackHintFor } from "@/server/features/sam/samToolRecoveryMessages";
import { getSamTraceBus, runWithTraceScope } from "@/server/features/sam/samTraceBus";
import {
  diagnosticsToTraceMetadata,
  readDataforseoDiagnostics,
} from "@/server/lib/dataforseo/shared";

// The guarded execution behind every adapted SAM MCP tool, split out of
// samToolRecovery.ts to keep both files within lint budgets. Depends only on
// the recovery state machine plus dependency-free types, so unit and
// agent-loop tests can exercise the production guard without importing the
// full MCP tool graph (which needs the workers runtime).
//
// PHASE DT (Debug Trace): every lifecycle seam below emits a normalized trace
// event into the SAM trace bus — model attempt, gate decision, handler
// start/finish, provider outcome (via the DataRouter's ambient scope), retry,
// cache, and final tool completion. The emissions are strictly observational:
// no branching behavior changes, and the bus no-ops outside a turn.

// Flatten an MCP CallToolResult into a plain value for the model: the
// handler's human-readable text summary plus the structured data it returned.
function toModelOutput(result: CallToolResult): unknown {
  const summary = (result.content ?? [])
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
  return result.structuredContent
    ? { summary, data: result.structuredContent }
    : { summary };
}

/** The execution context the guarded runner needs — a subset of the adapter's. */
export type GuardedExecuteContext = {
  projectId: string;
  sessionId: string;
  tracker: ToolExecutionTracker;
  recovery: ToolRecoveryState;
  /** Bounded wait before the single automatic retry (injectable for tests). */
  sleep: (ms: number) => Promise<void>;
};

/**
 * HTTP status implied by a classified error code. Credit-class codes that
 * DataForSEO (40200/40210 task codes) and OpenSEO's own billing layer
 * (PAYMENT_REQUIRED, INSUFFICIENT_CREDITS, …) emit all normalize to 402 —
 * one number, one meaning in the panel's status line and 402 counter.
 */
function httpStatusOf(code: string): number | undefined {
  if (/^HTTP_40[12]\d0?$/.test(code)) return 402; // HTTP_402 / 40200 / 40210
  if (
    code === "PAYMENT_REQUIRED" ||
    code === "INSUFFICIENT_CREDITS" ||
    code === "BACKLINKS_BILLING_ISSUE" ||
    code === "AI_SEARCH_BILLING_ISSUE"
  ) {
    return 402;
  }
  const match = /^HTTP_(\d{3})$/.exec(code);
  return match ? Number(match[1]) : undefined;
}

/**
 * Fallback sources the recovery vocabulary directs the model to — the real
 * runtime hints, shortened for the trace. Undefined when no fallback applies
 * (input-validation failures have no data-source fallback).
 */
function fallbackSourcesFor(classified: ClassifiedToolError, toolName: string): string | undefined {
  if (classified.failureClass === "TOOL_INPUT_INVALID") return undefined;
  const hint = fallbackHintFor(toolName);
  // "Use fallback sources instead: X, Y, or Z." → "X, Y, or Z"
  const afterColon = hint.split(": ", 2)[1];
  return afterColon?.replace(/\.$/, "");
}

/**
 * Enforces the per-turn tool-recovery policy around one handler invocation:
 * duplicate-call gate → dedup cache → run (+ one bounded automatic retry for
 * rate limits / transient errors) → curated model-facing failure signals.
 * `run` returns the raw MCP CallToolResult; model shaping happens here.
 */
export async function executeAdaptedTool(input: {
  toolName: string;
  fullArgs: unknown;
  ctx: GuardedExecuteContext;
  run: () => Promise<CallToolResult>;
  postProcess?: (output: unknown) => unknown;
  cacheable: boolean;
}): Promise<unknown> {
  const { toolName, fullArgs, ctx, run, postProcess, cacheable } = input;
  const { projectId, tracker, sessionId, recovery, sleep } = ctx;
  const bus = getSamTraceBus();
  const startedAt = Date.now();
  // Every entry into the guarded runner is one MODEL tool-call attempt (the
  // AI SDK invokes execute once per emitted tool call; Think re-invokes it on
  // model-driven repeats). This is the count the UI must be able to contrast
  // with handler executions below.
  bus.push({ event: "model_attempt", toolName });
  // Attempt index within this tool's turn lifecycle: 1 for the first real
  // handler execution, +1 per automatic retry. Blocked model attempts never
  // increment it (they never execute), which is exactly the distinction the
  // Debug Trace panel exists to show.
  let handlerAttempt = 0;

  const logError = (): void => {
    tracker.log({
      sessionId,
      projectId,
      toolName,
      reused: false,
      status: "error",
      durationMs: Date.now() - startedAt,
    });
  };

  const emitProviderError = (classified: ClassifiedToolError, error?: unknown): void => {
    // The provider/network outcome event: the DataRouter emits
    // provider_request/provider_success when it runs a provider; thrown
    // errors bypass it, so the guarded runner emits the error side here with
    // the classified (sanitized) status. The trace seam attaches the failing
    // provider's name to the error (providerErrorSource) so the panel blames
    // the provider that actually failed — never the one that ran last.
    // DataForSEO errors carry a sanitized diagnostics record (endpoint, HTTP
    // status, transport category, DataForSEO application status, safe request
    // metadata) attached at the actual failure point; merge it in so the
    // Debug Trace row shows the exact low-level cause.
    const source =
      typeof error === "object" && error !== null
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typed trace metadata
          (error as { providerErrorSource?: unknown }).providerErrorSource
        : undefined;
    const diagnostics =
      source === "dataforseo" && error !== undefined
        ? readDataforseoDiagnostics(error)
        : undefined;
    bus.push({
      event: "provider_error",
      toolName,
      attempt: handlerAttempt,
      provider:
        typeof source === "string" && source !== "" ? source : undefined,
      errorCode: classified.failureClass,
      httpStatus:
        httpStatusOf(classified.code) ??
        (typeof diagnostics?.httpStatus === "number"
          ? diagnostics.httpStatus
          : undefined),
      metadata: diagnostics ? diagnosticsToTraceMetadata(diagnostics) : undefined,
    });
  };

  // Per-turn duplicate-call protection: a tool the state machine marked
  // unavailable is never executed again this turn — the model gets a compact
  // blocked signal pointing at fallbacks instead of another paid attempt.
  // Keyed on tool name + failure class, never on arguments: a 402 with
  // different args is still a 402.
  const gate = recovery.canAttempt(toolName);
  bus.push({
    event: gate.allowed ? "gate_allowed" : "gate_blocked",
    toolName,
    blocked: !gate.allowed,
    errorCode: gate.allowed
      ? undefined
      : (recovery.getState(toolName)?.lastFailureClass ?? undefined),
  });
  if (!gate.allowed) {
    logError();
    const state = recovery.getState(toolName);
    if (state?.lastFailureClass) {
      bus.push({
        event: "fallback_selected",
        toolName,
        blocked: true,
        fallbackHint: fallbackSourcesFor(
          {
            failureClass: state.lastFailureClass,
            code: state.lastErrorCode ?? "",
            retryAfterSeconds: null,
            retryable: false,
          },
          toolName,
        ),
      });
    }
    bus.push({
      event: "tool_completed",
      toolName,
      blocked: true,
      errorCode: state?.lastFailureClass,
    });
    return {
      recoveryBlocked: true,
      error:
        gate.blocked ??
        buildToolBlockedMessage(toolName, {
          toolName,
          attempts: 1,
          unavailableForTurn: true,
          retryable: false,
        }),
    };
  }
  if (cacheable) {
    const cached = tracker.getCached(toolName, fullArgs);
    if (cached !== undefined) {
      bus.push({ event: "cache_hit", toolName, cacheHit: true });
      tracker.log({
        sessionId,
        projectId,
        toolName,
        reused: true,
        status: "ok",
        durationMs: Date.now() - startedAt,
      });
      bus.push({
        event: "tool_completed",
        toolName,
        durationMs: Date.now() - startedAt,
        cacheHit: true,
      });
      return cached;
    }
    bus.push({ event: "cache_miss", toolName, cacheHit: false });
  }
  const finalizeOk = (output: unknown): unknown => {
    const finalOutput = postProcess ? postProcess(output) : output;
    // Only successful outputs are cached: errors and all-failed batches must
    // never be served stale — a retry has to hit the provider again (or stay
    // blocked by the recovery state above).
    if (cacheable && !classifyToolOutput(output)) {
      tracker.setCached(toolName, fullArgs, finalOutput);
      bus.push({
        event: "cache_write",
        toolName,
        cacheWrite: true,
        attempt: handlerAttempt,
      });
    }
    tracker.log({
      sessionId,
      projectId,
      toolName,
      reused: false,
      status: "ok",
      durationMs: Date.now() - startedAt,
    });
    recovery.recordSuccess(toolName);
    bus.push({
      event: "handler_success",
      toolName,
      attempt: handlerAttempt,
      durationMs: Date.now() - startedAt,
    });
    bus.push({
      event: "tool_completed",
      toolName,
      attempt: handlerAttempt,
      durationMs: Date.now() - startedAt,
    });
    return finalOutput;
  };
  const failBatch = (output: unknown): unknown => {
    const batchFailure = classifyToolOutput(output);
    if (!batchFailure) return finalizeOk(output);
    // Batched tools (research_keywords, get_serp_results) swallow per-item
    // failures into ok:false rows instead of throwing — without this seam a
    // 402 across every seed would look like success and the model would retry
    // it. Record it so the turn policy applies, keep the data intact, and
    // append the compact unavailable signal.
    recovery.recordFailure(toolName, batchFailure);
    emitProviderError(batchFailure);
    logError();
    bus.push({
      event: "handler_error",
      toolName,
      attempt: handlerAttempt,
      errorCode: batchFailure.failureClass,
      durationMs: Date.now() - startedAt,
    });
    bus.push({
      event: "fallback_selected",
      toolName,
      fallbackHint: fallbackSourcesFor(batchFailure, toolName),
    });
    bus.push({
      event: "tool_completed",
      toolName,
      errorCode: batchFailure.failureClass,
      durationMs: Date.now() - startedAt,
    });
    const notice = buildToolFailureMessage(toolName, batchFailure.failureClass);
    if (typeof output === "object" && output !== null && "summary" in output) {
      return {
        ...(output as Record<string, unknown>),
        summary: `${String((output as { summary: unknown }).summary)}\n\n${notice}`,
        recoveryNotice: notice,
      };
    }
    return { error: notice };
  };
  const failThrown = (error: unknown, classified: ClassifiedToolError): unknown => {
    logError();
    // Surface a curated, secret-free failure signal so the model can recover
    // or report it, rather than aborting the whole turn on one bad tool call.
    // Never the raw provider message.
    bus.push({
      event: "fallback_selected",
      toolName,
      fallbackHint: fallbackSourcesFor(classified, toolName),
    });
    bus.push({
      event: "tool_completed",
      toolName,
      errorCode: classified.failureClass,
      durationMs: Date.now() - startedAt,
    });
    return {
      error: buildToolFailureMessage(toolName, classified.failureClass),
    };
  };
  const runOnce = (): Promise<unknown> =>
    run().then((result) => toModelOutput(result));
  // Each handler execution runs inside a trace scope so nested DataRouter /
  // provider seams attribute their events to this tool + attempt.
  const runAttempt = (): Promise<unknown> => {
    handlerAttempt += 1;
    bus.push({ event: "handler_start", toolName, attempt: handlerAttempt });
    return runWithTraceScope(
      { turnId: bus.currentTurnId() ?? "", toolName, attempt: handlerAttempt },
      runOnce,
    );
  };
  try {
    return failBatch(await runAttempt());
  } catch (error) {
    const classified = classifyToolError(error);
    emitProviderError(classified, error);
    bus.push({
      event: "handler_error",
      toolName,
      attempt: handlerAttempt,
      errorCode: classified.failureClass,
      httpStatus: httpStatusOf(classified.code),
    });
    const verdict = recovery.recordFailure(toolName, classified);
    if (verdict.retryAllowed) {
      // Exactly one automatic retry for rate limits / transient errors, with
      // a bounded wait (Retry-After capped). Any outcome records into the
      // same per-turn state, so a second failure blocks the tool — including
      // model-driven repeats, via the gate above.
      bus.push({
        event: "retry_scheduled",
        toolName,
        attempt: handlerAttempt,
        retryAllowed: true,
        errorCode: classified.failureClass,
      });
      await sleep(retryDelayMs(classified));
      try {
        bus.push({ event: "retry_executed", toolName, attempt: handlerAttempt + 1 });
        return failBatch(await runAttempt());
      } catch (retryError) {
        const retryClassified = classifyToolError(retryError);
        emitProviderError(retryClassified, retryError);
        bus.push({
          event: "handler_error",
          toolName,
          attempt: handlerAttempt,
          errorCode: retryClassified.failureClass,
          httpStatus: httpStatusOf(retryClassified.code),
        });
        recovery.recordFailure(toolName, retryClassified);
        return failThrown(retryError, retryClassified);
      }
    }
    return failThrown(error, classified);
  }
}
