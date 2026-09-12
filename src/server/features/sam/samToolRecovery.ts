import { parseRetryAfterSeconds } from "@/server/features/ai/providerErrors";
import { classifyToolInputError } from "@/server/features/ai/toolInputErrors";
import {
  BudgetExceededError,
  ProviderUnavailableError,
  ProviderUnsupportedError,
  RateLimitError,
  AuthenticationError,
} from "@/server/lib/seo-data/errors";
import { readDataforseoDiagnostics } from "@/server/lib/dataforseo/shared";
import {
  buildToolBlockedMessage,
  fallbackHintFor,
} from "./samToolRecoveryMessages";

export {
  buildToolBlockedMessage,
  buildToolFailureMessage,
  fallbackHintFor,
} from "./samToolRecoveryMessages";

// Per-turn tool failure classification + retry policy for SAM.
//
// Observed failure: a paid tool (research_keywords, get_serp_results, …)
// fails with a 402/credit error, yet the model calls the SAME tool again in
// the same turn — burning credits and spamming the transcript — because the
// failure lived only in model reasoning, never in runtime state. This module
// makes that state explicit: every tool failure is classified, retries are
// bounded per class, and a tool that exhausted its budget is blocked for the
// remainder of the turn — in code, not in prompt.
//
// Policy (failure-class based, never argument based — a 402 with different
// arguments is still a 402):
//   TOOL_INPUT_INVALID     allow 1 correction, then unavailable for the turn
//   CREDITS_UNAVAILABLE    never retry, immediately unavailable for the turn
//   DATAFORSEO_ACCESS_PAUSED never retry, immediately unavailable for the turn
//   RATE_LIMITED           exactly 1 automatic retry (bounded delay), then blocked
//   TRANSIENT_UPSTREAM     exactly 1 automatic retry, then blocked
//   PERMANENT_UNAVAILABLE  never retry, immediately unavailable for the turn
//
// Scope: one instance per SAM user turn (built fresh in beforeTurn alongside
// the toolset). Never shared across turns — a blocked tool is retryable again
// next turn.

export type ToolFailureClass =
  | "TOOL_INPUT_INVALID"
  | "CREDITS_UNAVAILABLE"
  | "DATAFORSEO_ACCESS_PAUSED"
  | "RATE_LIMITED"
  | "TRANSIENT_UPSTREAM"
  | "PERMANENT_UNAVAILABLE";

export type ToolAttemptState = {
  toolName: string;
  attempts: number;
  lastFailureClass?: ToolFailureClass;
  lastErrorCode?: string;
  unavailableForTurn: boolean;
  retryable: boolean;
};

export type ClassifiedToolError = {
  failureClass: ToolFailureClass;
  /** Sanitized short code for logs (AppError code, HTTP status, or class). */
  code: string;
  /** Provider Retry-After in seconds when the failure carried one. */
  retryAfterSeconds: number | null;
  /** Whether the adapter may attempt one automatic retry. */
  retryable: boolean;
};

/** Attempts before a tool is blocked: 1 initial + 1 retry/correction. */
export const MAX_TOOL_ATTEMPTS_PER_TURN = 2;
/** Ceiling for any automatic retry wait — a hostile Retry-After can't stall. */
export const MAX_TOOL_RETRY_DELAY_MS = 5_000;
const TRANSIENT_RETRY_BASE_DELAY_MS = 250;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string")
    return error.message;
  return "";
}

/** Retry-unwrap the AI SDK envelope the same way providerErrors does. */
function candidatesOf(error: unknown): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  if (isRecord(error) && Array.isArray(error.errors)) {
    const attempts: unknown[] = error.errors;
    const last = attempts[attempts.length - 1];
    if (isRecord(last)) candidates.push(last);
  }
  if (isRecord(error)) candidates.push(error);
  return candidates;
}

function statusOf(error: unknown): number | undefined {
  for (const candidate of candidatesOf(error)) {
    for (const key of ["statusCode", "status", "status_code"]) {
      const value = candidate[key];
      if (typeof value === "number") return value;
    }
    const cause = candidate.cause;
    if (isRecord(cause) && typeof cause.status === "number") {
      return cause.status;
    }
  }
  return undefined;
}

function retryAfterInRecord(record: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(record)) {
    if (/retry.?after/i.test(key)) {
      const parsed = parseRetryAfterSeconds(value);
      if (parsed !== null) return parsed;
    }
    if (isRecord(value)) {
      const nested = retryAfterInHeaders(value);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function retryAfterInHeaders(headers: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(headers)) {
    if (!/retry.?after/i.test(key)) continue;
    const parsed = parseRetryAfterSeconds(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function extractRetryAfterSeconds(error: unknown): number | null {
  for (const candidate of candidatesOf(error)) {
    const parsed = retryAfterInRecord(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

const BILLING_TEXT =
  /insufficient funds|balance is too low|payment required|insufficient credits|in_flight_budget_exhausted|would exceed your available credits|credit.?unavailable|budget.?exceeded|recharged|\bbilling\b|\bbalance\b/i;
const RATE_LIMIT_TEXT = /rate.?limit|too many requests|\b429\b/i;
const TRANSIENT_TEXT =
  /fetch failed|ETIMEDOUT|timed?\s?out|socket hang up|EPIPE|other side closed|ECONNRESET|gateway|temporarily unavailable|server error|\b50[0238]\b|UPSTREAM_UNAVAILABLE/i;
const CONFIG_TEXT =
  /disabled|not configured|no usable credential|does not support|doesn't support|not supported|unsupported|unavailable for this model|invalid base url|failed to parse url|invalid url|ENOTFOUND|ECONNREFUSED|certificate|SSL/i;
const INPUT_TEXT =
  /invalid input for tool|invalid tool arguments|validation (failed|error)|invalid argument|required parameter|unknown key|invalid enum|expected .+ received|NoSuchTool|does not exist/i;

const CREDIT_APP_CODES = new Set([
  "PAYMENT_REQUIRED",
  "INSUFFICIENT_CREDITS",
  "BACKLINKS_BILLING_ISSUE",
  "AI_SEARCH_BILLING_ISSUE",
]);

function finish(
  failureClass: ToolFailureClass,
  code: string,
  error: unknown,
): ClassifiedToolError {
  const retryable =
    failureClass === "RATE_LIMITED" || failureClass === "TRANSIENT_UPSTREAM";
  return {
    failureClass,
    code,
    retryAfterSeconds: retryable ? extractRetryAfterSeconds(error) : null,
    retryable,
  };
}

/** Duck-typed AppError code accessor — survives chunk boundaries where
 * `instanceof AppError` can fail (the lazy DataForSEO SDK chunk re-evaluates
 * the module graph). An AppError always has a string `code` property. */
function appErrorCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code: unknown = Reflect.get(error, "code");
  return typeof code === "string" && code !== "" ? code : undefined;
}

/** HTTP status read from DataForSEO diagnostics attached to the thrown error. */
function diagnosticsHttpStatusOf(error: unknown): number | undefined {
  const diagnostics = readDataforseoDiagnostics(error);
  return typeof diagnostics?.httpStatus === "number"
    ? diagnostics.httpStatus
    : undefined;
}

/**
 * Classify any tool-execution failure into the recovery policy. Reuses the
 * Phase V tool-input classifier first (an input failure never involves a
 * provider, so no later heuristic may claim it) and the Phase U Retry-After
 * parser — no parallel error system.
 */
export function classifyToolError(error: unknown): ClassifiedToolError {
  const rawText = errorText(error);
  const candidates = candidatesOf(error);

  // Phase V invariant: tool-input failures classify before every other signal.
  if (classifyToolInputError(error, candidates, rawText)) {
    return finish("TOOL_INPUT_INVALID", "TOOL_INPUT_INVALID", error);
  }

  if (error instanceof BudgetExceededError) {
    return finish("CREDITS_UNAVAILABLE", "PAYMENT_REQUIRED", error);
  }
  if (error instanceof RateLimitError) {
    return finish("RATE_LIMITED", "RATE_LIMITED", error);
  }
  if (
    error instanceof ProviderUnsupportedError ||
    error instanceof AuthenticationError
  ) {
    return finish("PERMANENT_UNAVAILABLE", error.name, error);
  }
  if (error instanceof ProviderUnavailableError) {
    return TRANSIENT_TEXT.test(rawText)
      ? finish("TRANSIENT_UPSTREAM", "UPSTREAM_UNAVAILABLE", error)
      : finish("PERMANENT_UNAVAILABLE", "UPSTREAM_UNAVAILABLE", error);
  }
  // Duck-typed AppError path (an AppError's `code` is the product vocabulary,
  // more precise than any text heuristic): an AppError that crossed a lazy
  // chunk boundary — where instanceof can fail — still classifies by its code
  // and never falls through to UNKNOWN.
  const appCode = appErrorCodeOf(error);
  if (appCode !== undefined) {
    if (CREDIT_APP_CODES.has(appCode)) {
      return finish("CREDITS_UNAVAILABLE", appCode, error);
    }
    switch (appCode) {
      case "RATE_LIMITED":
        return finish("RATE_LIMITED", appCode, error);
      case "VALIDATION_ERROR":
        return finish("TOOL_INPUT_INVALID", appCode, error);
      case "DATAFORSEO_AUTH_FAILED":
        return finish("PERMANENT_UNAVAILABLE", appCode, error);
      case "UPSTREAM_UNAVAILABLE":
        return finish("TRANSIENT_UPSTREAM", appCode, error);
      case "INTERNAL_ERROR":
        break;
      default:
        break;
    }
  }

  const status = statusOf(error) ?? diagnosticsHttpStatusOf(error);
  if (status !== undefined) {
    if (status === 402 || status === 40200 || status === 40210) {
      return finish("CREDITS_UNAVAILABLE", `HTTP_${status}`, error);
    }
    if (status === 429) return finish("RATE_LIMITED", "HTTP_429", error);
    if (status === 400) return finish("TOOL_INPUT_INVALID", "HTTP_400", error);
    if (status === 408) return finish("TRANSIENT_UPSTREAM", "HTTP_408", error);
    if (status === 401 || status === 403 || status === 404) {
      return finish("PERMANENT_UNAVAILABLE", `HTTP_${status}`, error);
    }
    if (status >= 500)
      return finish("TRANSIENT_UPSTREAM", `HTTP_${status}`, error);
  }

  // An authoritative transport category from DataForSEO diagnostics (DNS /
  // timeout / connection / TLS, classified from the actual runtime exception)
  // precedes every text heuristic: a network failure is transient regardless
  // of what the message text resembles.
  const diagnostics = readDataforseoDiagnostics(error);
  if (diagnostics?.transportError) {
    return finish("TRANSIENT_UPSTREAM", diagnostics.transportError, error);
  }

  // DataForSEO 40201 (paused API/account access): dedicated permanent class,
  // keyed on the exact attached status_code — never message text/credits/transient.
  if (diagnostics?.dataforseoStatus === 40201) {
    return finish("DATAFORSEO_ACCESS_PAUSED", "APP_40201", error);
  }

  if (BILLING_TEXT.test(rawText)) {
    return finish("CREDITS_UNAVAILABLE", "BILLING_TEXT", error);
  }
  if (RATE_LIMIT_TEXT.test(rawText)) {
    return finish("RATE_LIMITED", "RATE_LIMIT_TEXT", error);
  }
  if (INPUT_TEXT.test(rawText)) {
    return finish("TOOL_INPUT_INVALID", "INPUT_TEXT", error);
  }
  if (CONFIG_TEXT.test(rawText)) {
    return finish("PERMANENT_UNAVAILABLE", "CONFIG_TEXT", error);
  }
  if (TRANSIENT_TEXT.test(rawText)) {
    return finish("TRANSIENT_UPSTREAM", "TRANSIENT_TEXT", error);
  }
  // Unknown failures get the transient budget (one bounded retry), never an
  // open loop — the state machine below still blocks the third attempt.
  return finish("TRANSIENT_UPSTREAM", "UNKNOWN", error);
}

/**
  * Classify free-text failure detail (per-item batch errors, which never
  * throw) with the same text ladder as thrown errors.
  */
export function classifyToolErrorText(detail: string): ClassifiedToolError {
  return classifyToolError(new Error(detail));
}

/** Bounded wait before the single automatic retry. Pure — testable, no timers. */
export function retryDelayMs(classified: ClassifiedToolError): number {
  if (classified.failureClass === "RATE_LIMITED") {
    if (classified.retryAfterSeconds !== null) {
      return Math.min(
        classified.retryAfterSeconds * 1000,
        MAX_TOOL_RETRY_DELAY_MS,
      );
    }
    return TRANSIENT_RETRY_BASE_DELAY_MS;
  }
  return TRANSIENT_RETRY_BASE_DELAY_MS;
}

type ToolRecoveryLog = {
  tool: string;
  failureClass?: ToolFailureClass;
  code?: string;
  attempt?: number;
  retry?: boolean;
  unavailableForTurn?: boolean;
  fallbackHint?: string;
};

export type ToolRecoveryState = {
  canAttempt(toolName: string): { allowed: boolean; blocked: string | null };
  recordSuccess(toolName: string): void;
  recordFailure(
    toolName: string,
    classified: ClassifiedToolError,
  ): { unavailableForTurn: boolean; retryAllowed: boolean };
  /** SDK-level input rejections (they bypass execute) still count per-turn. */
  recordInputRejection(toolName: string): void;
  getState(toolName: string): ToolAttemptState | undefined;
  /** Explicit per-turn reset — a blocked tool is retryable again next turn. */
  reset(): void;
};

/**
 * Explicit per-turn tool failure state. Blocking is keyed on tool NAME with
 * the failure CLASS deciding the budget — a 402 blocks every later call with
 * any arguments, while an input failure still permits one correction.
 * A successful call clears the entry (transient failures don't stick).
 */
export function createToolRecoveryState(
  sessionId?: string,
  projectId?: string,
): ToolRecoveryState {
  const states = new Map<string, ToolAttemptState>();

  function log(event: ToolRecoveryLog): void {
    console.log(
      JSON.stringify({
        type: "tool-recovery",
        sessionId,
        projectId,
        ...event,
      }),
    );
  }

  function entryFor(toolName: string): ToolAttemptState {
    let entry = states.get(toolName);
    if (!entry) {
      entry = {
        toolName,
        attempts: 0,
        unavailableForTurn: false,
        retryable: true,
      };
      states.set(toolName, entry);
    }
    return entry;
  }

  return {
    canAttempt(toolName) {
      const entry = states.get(toolName);
      if (entry?.unavailableForTurn) {
        log({
          tool: toolName,
          failureClass: entry.lastFailureClass,
          code: entry.lastErrorCode,
          attempt: entry.attempts,
          retry: false,
          unavailableForTurn: true,
        });
        return {
          allowed: false,
          blocked: buildToolBlockedMessage(toolName, entry),
        };
      }
      return { allowed: true, blocked: null };
    },

    recordSuccess(toolName) {
      const entry = states.get(toolName);
      if (entry && entry.attempts > 0) {
        log({ tool: toolName, attempt: entry.attempts, retry: false });
      }
      // Success clears transient failure — the tool stays available.
      states.delete(toolName);
    },

    recordFailure(toolName, classified) {
      const entry = entryFor(toolName);
      entry.attempts += 1;
      entry.lastFailureClass = classified.failureClass;
      entry.lastErrorCode = classified.code;
      const budgetExhausted = entry.attempts >= MAX_TOOL_ATTEMPTS_PER_TURN;
      // Credits, access-paused, and permanent errors: one strike blocks the turn.
      const immediateBlock =
        classified.failureClass === "CREDITS_UNAVAILABLE" ||
        classified.failureClass === "DATAFORSEO_ACCESS_PAUSED" ||
        classified.failureClass === "PERMANENT_UNAVAILABLE";
      entry.unavailableForTurn = immediateBlock || budgetExhausted;
      entry.retryable = classified.retryable && !entry.unavailableForTurn;
      const retryAllowed =
        classified.retryable && !immediateBlock && !budgetExhausted;
      log({
        tool: toolName,
        failureClass: classified.failureClass,
        code: classified.code,
        attempt: entry.attempts,
        retry: retryAllowed,
        unavailableForTurn: entry.unavailableForTurn,
        fallbackHint: fallbackHintFor(toolName),
      });
      return { unavailableForTurn: entry.unavailableForTurn, retryAllowed };
    },

    recordInputRejection(toolName) {
      // InvalidToolInputError / NoSuchToolError never reach execute(), so the
      // stream seam reports them here. Same budget as thrown input failures:
      // one correction, then unavailable for the turn.
      const entry = entryFor(toolName);
      if (entry.unavailableForTurn) return;
      entry.attempts += 1;
      entry.lastFailureClass = "TOOL_INPUT_INVALID";
      entry.lastErrorCode = "TOOL_INPUT_INVALID";
      entry.retryable = false;
      if (entry.attempts >= MAX_TOOL_ATTEMPTS_PER_TURN) {
        entry.unavailableForTurn = true;
      }
      log({
        tool: toolName,
        failureClass: "TOOL_INPUT_INVALID",
        code: "TOOL_INPUT_INVALID",
        attempt: entry.attempts,
        retry: !entry.unavailableForTurn,
        unavailableForTurn: entry.unavailableForTurn,
      });
    },

    getState(toolName) {
      const entry = states.get(toolName);
      return entry ? { ...entry } : undefined;
    },

    reset() {
      states.clear();
    },
  };
}
