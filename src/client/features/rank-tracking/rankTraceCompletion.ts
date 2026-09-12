import {
  scrubGlobalTraceText,
  type GlobalTraceKeywordChild,
  type GlobalTraceOperation,
  type GlobalTraceProviderCall,
} from "@/shared/globalTraceTypes";
import { parseDataforseoDiagnosticsFromErrorMessage } from "@/shared/dataforseoDiagnosticsParser";

/**
 * Pure, testable decision logic for the rank-check Global Debug Trace
 * lifecycle. No React, no store access — the hooks call these helpers and
 * the store stays a dumb append-only log.
 *
 * Honesty rules enforced here:
 * - Only snapshot-derived facts become per-keyword children. HTTP/task
 *   statuses are NEVER fabricated: provider details are mapped only from
 *   canonical markers the DataForSEO seam emits ("DataForSEO HTTP <status>
 *   on <path>", "DataForSEO task error (<code>)"); otherwise they stay
 *   omitted, not defaulted to 200/20000.
 * - A child is `success` only with a fresh snapshot showing a position,
 *   `no_result` with a fresh snapshot showing no ranking, and `failed`
 *   when this run left no snapshot for the keyword at all.
 */

export type RankCheckDevices = "both" | "desktop" | "mobile";

/** Number of DataForSEO live tasks the manual workflow issues per keyword. */
export function providerTaskCount(
  validatedCount: number,
  devices: RankCheckDevices,
): number {
  return validatedCount * (devices === "both" ? 2 : 1);
}

export type CheckBusyState = "proceed" | "busy-inflight" | "busy-running";

/**
 * Decides whether a Check click may start a new server request.
 * Extracted so the "every click leaves a trace" contract is unit-testable:
 * busy clicks must produce a `blocked` trace + toast, never silence.
 */
export function resolveCheckBusyState(input: {
  isPending: boolean;
  isRunning: boolean;
}): CheckBusyState {
  if (input.isPending) return "busy-inflight";
  if (input.isRunning) return "busy-running";
  return "proceed";
}

export function busyBlockedReason(state: CheckBusyState): string {
  return state === "busy-inflight"
    ? "A rank check request is already in flight"
    : "A rank check is already running";
}

export interface ClassifiedRunError {
  errorClass: "CREDITS_UNAVAILABLE" | "OPERATION_FAILED";
  budget: "BLOCKED" | "PASS";
  blockedReason?: string;
}

/**
 * Classifies a rank-run failure message using only its text evidence.
 * Credit/budget wording → CREDITS_UNAVAILABLE + BLOCKED; everything else
 * stays a generic OPERATION_FAILED with budget PASS (unknown ≠ blocked).
 */
export function classifyRunError(message: string): ClassifiedRunError {
  const isBudget =
    /credit|budget|payment|402|insufficient|upgrade|top up|topup/i.test(
      message,
    );
  if (isBudget) {
    return {
      errorClass: "CREDITS_UNAVAILABLE",
      budget: "BLOCKED",
      blockedReason: message,
    };
  }
  return { errorClass: "OPERATION_FAILED", budget: "PASS" };
}

export interface RankRunForTrace {
  id: string;
  status: string;
  keywordsChecked: number;
  keywordsTotal: number;
  errorMessage?: string | null;
  startedAt?: string | null;
}

export interface RankRowForTrace {
  trackingKeywordId: string;
  keyword?: string;
  desktop?: {
    position?: number | null;
    previousPosition?: number | null;
    checkedAt?: string | null;
  } | null;
  mobile?: {
    position?: number | null;
    previousPosition?: number | null;
    checkedAt?: string | null;
  } | null;
}

/**
 * A snapshot belongs to this run when it was checked at/after the run
 * started. Without a run start time we fall back to any checkedAt evidence
 * (best effort, documented in metadata by the caller).
 */
function isFreshSnapshot(
  checkedAt: string | null | undefined,
  runStartedAt: string | null | undefined,
): boolean {
  if (!checkedAt) return false;
  if (!runStartedAt) return true;
  return checkedAt >= runStartedAt;
}

export type RankCompletionPatch = Partial<GlobalTraceOperation> & {
  status: "success" | "failed";
  children: GlobalTraceKeywordChild[];
};

/**
 * Builds the completion patch for a terminal rank run from authoritative
 * runtime facts only: the run row + latest result rows. Target keywords are
 * the trace's validated selected IDs (falling back to all row IDs for
 * check-all runs that recorded no explicit selection).
 */
export function buildRankCompletionPatch(input: {
  run: RankRunForTrace;
  rows: RankRowForTrace[];
  targetIds: string[];
}): RankCompletionPatch {
  const { run, rows, targetIds } = input;
  const rowMap = new Map(rows.map((r) => [r.trackingKeywordId, r]));

  const children: GlobalTraceKeywordChild[] = targetIds.map((id) => {
    const row = rowMap.get(id);
    const devices = [row?.desktop, row?.mobile].filter(
      (d): d is NonNullable<typeof d> => d != null,
    );
    const fresh = devices.filter((d) =>
      isFreshSnapshot(d.checkedAt, run.startedAt),
    );

    if (fresh.length === 0) {
      return {
        keywordId: id,
        keyword: row?.keyword,
        status: "failed" as const,
        provider: "DataForSEO",
        // Scrubbed: the run message crosses into a visible trace record.
        error: run.errorMessage
          ? scrubGlobalTraceText(run.errorMessage)
          : "No snapshot recorded for this run",
      };
    }

    const positionAfter =
      fresh.find((d) => d.position != null)?.position ?? null;
    const positionBefore =
      fresh.find((d) => d.previousPosition != null)?.previousPosition ?? null;
    return {
      keywordId: id,
      keyword: row?.keyword,
      status:
        positionAfter != null ? ("success" as const) : ("no_result" as const),
      provider: "DataForSEO",
      positionBefore,
      positionAfter,
    };
  });

  const succeeded = children.filter(
    (c) => c.status === "success" || c.status === "no_result",
  ).length;
  const failed = children.length - succeeded;

  const runFailed = run.status === "failed";
  const status: "success" | "failed" =
    runFailed || failed > 0 ? "failed" : "success";

  const patch: RankCompletionPatch = {
    status,
    rankChecksSucceeded: succeeded,
    rankChecksFailed: failed,
    children,
    counters: {
      checked: run.keywordsChecked,
      total: run.keywordsTotal,
    },
  };

  // Defense in depth: the run message crosses from the server record into a
  // developer-visible trace — scrub credential-shaped substrings even though
  // the producer already emits pre-scrubbed canonical messages.
  const rawMessage = run.errorMessage || "Rank check failed";
  if (run.errorMessage) {
    patch.errorMessage = scrubGlobalTraceText(run.errorMessage);
  }
  if (status === "failed") {
    if (applyProviderDiagnostics(patch, rawMessage, succeeded)) {
      // Canonical provider evidence applied (see helper below).
    } else {
      const classified = classifyRunError(rawMessage);
      patch.errorClass = classified.errorClass;
      patch.budget = classified.budget;
      if (classified.blockedReason) {
        patch.blockedReason = scrubGlobalTraceText(classified.blockedReason);
        // A budget block before any snapshot means no provider call executed.
        // Never zero the count when snapshots prove calls happened.
        if (succeeded === 0) {
          patch.providerCalls = 0;
        }
      }
      // Transport-layer evidence (no HTTP response arrived) upgrades the
      // generic label without claiming anything unobserved.
      const transportParsed =
        parseDataforseoDiagnosticsFromErrorMessage(rawMessage);
      if (transportParsed.transport !== "HTTP") {
        patch.errorClass = transportParsed.errorClass;
      }
    }
    if (!patch.errorMessage) {
      patch.errorMessage = "Rank check failed";
    }
  }

  return patch;
}

/**
 * Canonical provider markers emitted by the DataForSEO HTTP seam
 * (`DataForSEO HTTP <status> on <path>…`) and the task envelope
 * (`DataForSEO task error (<code>): …`). Only when one is present do we map
 * provider/endpoint/HTTP/task/transport into the trace — otherwise the
 * caller keeps its generic classification and nothing is fabricated.
 *
 * Distinguishes: HTTP 5xx (TRANSIENT_UPSTREAM) ≠ task error inside HTTP 200
 * (TASK_ERROR / CREDITS_UNAVAILABLE) ≠ 402 ≠ 429. Returns true when applied.
 */
const PROVIDER_MARKER_RE =
  /DataForSEO HTTP \d{3}|DataForSEO task error \(\d+\)/;

function applyProviderDiagnostics(
  patch: RankCompletionPatch,
  rawMessage: string,
  succeeded: number,
): boolean {
  if (!PROVIDER_MARKER_RE.test(rawMessage)) return false;
  const d = parseDataforseoDiagnosticsFromErrorMessage(rawMessage);
  const providerCall: GlobalTraceProviderCall = {
    provider: d.provider,
    endpoint: d.endpoint,
    httpStatus: d.httpStatus,
    taskStatus: d.dataforseoStatusCode,
    statusMessage: d.dataforseoStatusMessage,
    transport: d.transport,
    billing: "Paid",
    metered: true,
    budgetGuard: d.errorClass === "CREDITS_UNAVAILABLE" ? "BLOCKED" : "PASS",
  };
  patch.providers = [providerCall];
  patch.httpStatus = d.httpStatus ?? undefined;
  patch.errorClass = d.errorClass;
  if (d.errorClass === "CREDITS_UNAVAILABLE") {
    patch.budget = "BLOCKED";
    patch.blockedReason = scrubGlobalTraceText(rawMessage);
    // A credit block with no snapshot means no billable call completed.
    // Never zero the count when snapshots prove calls happened.
    if (succeeded === 0) {
      patch.providerCalls = 0;
    }
  }
  return true;
}
