import type { StopCondition, ToolSet } from "ai";

// Bounds for the SAM agent's inference loop. Think's own `maxSteps` guard
// stays on; the tool-call cap stops the turn before the model can fan out
// unbounded paid calls even when step count is generous.

export const DEFAULT_MAX_STEPS = 48;
export const DEFAULT_MAX_TOOL_CALLS = 24;

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