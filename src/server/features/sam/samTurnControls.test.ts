import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_POLL_INITIAL_MS,
  DEFAULT_POLL_MAX_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  backoffDelayMs,
  countToolCalls,
  parsePollConfig,
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

describe("backoffDelayMs", () => {
  it("doubles from the initial delay and caps at max", () => {
    expect(backoffDelayMs(1, 1_000, 8_000)).toBe(1_000);
    expect(backoffDelayMs(2, 1_000, 8_000)).toBe(2_000);
    expect(backoffDelayMs(3, 1_000, 8_000)).toBe(4_000);
    expect(backoffDelayMs(4, 1_000, 8_000)).toBe(8_000);
    expect(backoffDelayMs(10, 1_000, 8_000)).toBe(8_000);
  });
});

describe("parsePollConfig", () => {
  const envOverrides: Record<string, string> = {
    AI_AGENT_POLL_INITIAL_MS: "500",
    AI_AGENT_POLL_MAX_MS: "not-a-number",
    AI_AGENT_MAX_POLL_ATTEMPTS: "0",
    AI_AGENT_TOOL_TIMEOUT_MS: "30000",
  };
  const readOverride = (key: string) => envOverrides[key];

  it("returns the documented defaults when env is unset", () => {
    expect(parsePollConfig(() => null)).toEqual({
      initialMs: DEFAULT_POLL_INITIAL_MS,
      maxMs: DEFAULT_POLL_MAX_MS,
      maxAttempts: DEFAULT_MAX_POLL_ATTEMPTS,
      timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    });
  });

  it("overrides valid values and ignores invalid ones", () => {
    expect(parsePollConfig(readOverride)).toEqual({
      initialMs: 500,
      maxMs: DEFAULT_POLL_MAX_MS,
      maxAttempts: DEFAULT_MAX_POLL_ATTEMPTS,
      timeoutMs: 30_000,
    });
  });
});