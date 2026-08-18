import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TOOL_CALLS,
  countToolCalls,
  parsePositiveIntEnv,
} from "./samTurnControls";

const step = (toolCalls: unknown[]) => ({ toolCalls });

describe("parsePositiveIntEnv", () => {
  it("returns the fallback for missing, invalid, and non-positive values", () => {
    expect(parsePositiveIntEnv(null, DEFAULT_MAX_STEPS)).toBe(DEFAULT_MAX_STEPS);
    expect(parsePositiveIntEnv("", DEFAULT_MAX_STEPS)).toBe(DEFAULT_MAX_STEPS);
    expect(parsePositiveIntEnv("abc", DEFAULT_MAX_STEPS)).toBe(DEFAULT_MAX_STEPS);
    expect(parsePositiveIntEnv("0", DEFAULT_MAX_STEPS)).toBe(DEFAULT_MAX_STEPS);
    expect(parsePositiveIntEnv("-5", DEFAULT_MAX_STEPS)).toBe(DEFAULT_MAX_STEPS);
    expect(parsePositiveIntEnv("3.5", DEFAULT_MAX_STEPS)).toBe(DEFAULT_MAX_STEPS);
  });

  it("parses valid positive integers", () => {
    expect(parsePositiveIntEnv("12", DEFAULT_MAX_TOOL_CALLS)).toBe(12);
    expect(parsePositiveIntEnv("100", DEFAULT_MAX_STEPS)).toBe(100);
  });
});

describe("countToolCalls", () => {
  it("sums tool calls across all steps", () => {
    expect(countToolCalls([step([{}, {}]), step([{}])])).toBe(3);
    expect(countToolCalls([step([]), step([])])).toBe(0);
  });
});