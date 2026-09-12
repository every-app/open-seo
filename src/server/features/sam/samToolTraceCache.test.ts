import { describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { executeAdaptedTool } from "./samGuardedToolExecute";
import {
  billing402,
  count,
  eventsFor,
  okResult,
  traceHarness,
} from "./samTraceTestHelpers";

// Debug Trace (Phase DT) — cache behavior + turn-reset isolation. Split from
// samToolTrace.test.ts to keep both files within lint budgets.

describe("cache behavior trace", () => {
  it("dedup cache hit skips handler and provider entirely", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, bus } = traceHarness();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.resolve(okResult({ rows: [] }));
    };
    await executeAdaptedTool({
      toolName: "list_saved_keywords",
      fullArgs: { limit: 10 },
      ctx,
      run,
      cacheable: true,
    });
    await executeAdaptedTool({
      toolName: "list_saved_keywords",
      fullArgs: { limit: 10 },
      ctx,
      run,
      cacheable: true,
    });
    expect(runs).toBe(1);
    const events = eventsFor(
      bus.snapshot()?.events ?? [],
      "list_saved_keywords",
    );
    expect(count(events, "cache_miss")).toBe(1);
    expect(count(events, "cache_hit")).toBe(1);
    expect(count(events, "handler_start")).toBe(1);
    // The second lifecycle completed via cache, not execution.
    const last = events[events.length - 1];
    expect(last?.event).toBe("tool_completed");
    expect(last?.cacheHit).toBe(true);
    logSpy.mockRestore();
  });

  it("failed operations never record a cache write", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, bus } = traceHarness();
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: {},
      ctx,
      run: () => Promise.reject(billing402()),
      cacheable: true,
    });
    const events = eventsFor(bus.snapshot()?.events ?? [], "research_keywords");
    expect(count(events, "cache_write")).toBe(0);
    logSpy.mockRestore();
  });
});

describe("turn reset and isolation", () => {
  it("a fresh turn can execute a tool that was blocked last turn", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, recovery, bus } = traceHarness();
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: {},
      ctx,
      run: () => Promise.reject(billing402()),
      cacheable: true,
    });
    // New turn: fresh recovery + fresh trace scope.
    recovery.reset();
    bus.startTurn({ ai: { provider: "OpenRouter", model: "x" } });
    let runs = 0;
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: {},
      ctx,
      run: () => {
        runs++;
        return Promise.resolve(okResult({ results: [] }));
      },
      cacheable: true,
    });
    expect(runs).toBe(1);
    const snap = bus.snapshot();
    expect(snap?.ai.provider).toBe("OpenRouter");
    // Only this turn's events — the blocked history is gone.
    expect(
      eventsFor(snap?.events ?? [], "research_keywords").length,
    ).toBeGreaterThan(0);
    expect(count(snap?.events ?? [], "gate_blocked")).toBe(0);
    logSpy.mockRestore();
  });
});
