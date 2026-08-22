import type { StopCondition, ToolSet } from "ai";

// Bounds for the SAM agent's inference loop. Think's own `maxSteps` guard
// stays on; the tool-call cap stops the turn before the model can fan out
// unbounded paid calls even when step count is generous.

export const DEFAULT_MAX_STEPS = 48;
export const DEFAULT_MAX_TOOL_CALLS = 24;

// Long-running tool polling (site audits). The poll_site_audit tool walks an
// exponential backoff between status reads and gives up on whichever of
// max-attempts / wall-clock timeout hits first, returning the last known
// progress instead of blocking the turn forever. All four are env-tunable;
// none of them loosens AI_AGENT_MAX_TOOL_CALLS / AI_AGENT_MAX_STEPS — the
// poller is still one tool call in those budgets.
export const DEFAULT_POLL_INITIAL_MS = 1_000;
export const DEFAULT_POLL_MAX_MS = 8_000;
export const DEFAULT_MAX_POLL_ATTEMPTS = 12;
export const DEFAULT_TOOL_TIMEOUT_MS = 150_000;

/** Env-tunable polling bounds for one long-running tool wait. */
export type PollConfig = {
  initialMs: number;
  maxMs: number;
  maxAttempts: number;
  timeoutMs: number;
};

/**
 * Resolve the four polling env vars against defaults. Kept pure (env values
 * come in through a reader) so tests can exercise invalid/missing values.
 */
export function parsePollConfig(
  read: (key: string) => string | null | undefined,
): PollConfig {
  return {
    initialMs: parsePositiveIntEnv(
      read("AI_AGENT_POLL_INITIAL_MS"),
      DEFAULT_POLL_INITIAL_MS,
    ),
    maxMs: parsePositiveIntEnv(
      read("AI_AGENT_POLL_MAX_MS"),
      DEFAULT_POLL_MAX_MS,
    ),
    maxAttempts: parsePositiveIntEnv(
      read("AI_AGENT_MAX_POLL_ATTEMPTS"),
      DEFAULT_MAX_POLL_ATTEMPTS,
    ),
    timeoutMs: parsePositiveIntEnv(
      read("AI_AGENT_TOOL_TIMEOUT_MS"),
      DEFAULT_TOOL_TIMEOUT_MS,
    ),
  };
}

/**
 * Backoff before poll attempt N (1-based): initial, then doubling, capped.
 * Pure so the schedule is testable without timers.
 */
export function backoffDelayMs(
  attempt: number,
  initialMs: number,
  maxMs: number,
): number {
  return Math.min(initialMs * 2 ** Math.max(0, attempt - 1), maxMs);
}

/**
 * Parse a positive integer env override, falling back to `fallback` for
 * missing/invalid values. Kept pure for tests.
 */
export function parsePositiveIntEnv(
  raw: string | null | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

/**
 * Cumulative tool-call count across all steps of a turn. Extracted from
 * `toolCallCap` so the cap's logic is testable without constructing real
 * AI SDK step results.
 */
export function countToolCalls(steps: { toolCalls: unknown[] }[]): number {
  return steps.reduce((total, step) => total + step.toolCalls.length, 0);
}

/**
 * Stop condition that ends the turn once the cumulative number of tool calls
 * across all steps reaches `maxToolCalls`. The AI SDK runs this check between
 * steps, so the turn can never execute more than the cap.
 */
export function toolCallCap<TOOLS extends ToolSet>(
  maxToolCalls: number,
): StopCondition<TOOLS> {
  return ({ steps }) => countToolCalls(steps) >= maxToolCalls;
}