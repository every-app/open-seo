import { describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { executeAdaptedTool } from "./samGuardedToolExecute";
import { getSamTraceBus } from "./samTraceBus";
import {
  accessPaused40201,
  billing402,
  count,
  eventsFor,
  httpError,
  okResult,
  traceHarness,
} from "./samTraceTestHelpers";

// Debug Trace (Phase DT) — the required deterministic failure scenarios:
// 402 (one execution, blocked repeats, fallback), 429 (retry → success),
// 503 (retry → success), provider identity, and secrecy. Cache + turn-reset
// suites live in samToolTraceCache.test.ts.

describe("required 402 trace — handler once, 402, blocked ×2, fallback", () => {
  it(
    "research_keywords: 402 → blocked retries grouped under the same lifecycle",
    { timeout: 10_000 },
    async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { ctx } = traceHarness();
      let runs = 0;
      const run = (): Promise<CallToolResult> => {
        runs++;
        return Promise.reject(billing402());
      };
      const call = (args: unknown) =>
        executeAdaptedTool({
          toolName: "research_keywords",
          fullArgs: args,
          ctx,
          run,
          cacheable: true,
        });
      await call({ seeds: [{ seed: "dubai loans" }] });
      await call({ seeds: [{ seed: "again" }] });
      await call({ seeds: [{ seed: "third" }] });
      // Real execution happened exactly once.
      expect(runs).toBe(1);

      const snap = getSamTraceBus().snapshot();
      const events = eventsFor(snap?.events ?? [], "research_keywords");
      // Three model attempts, one gate allow + two blocks.
      expect(count(events, "model_attempt")).toBe(3);
      expect(count(events, "gate_allowed")).toBe(1);
      expect(count(events, "gate_blocked")).toBe(2);
      expect(count(events, "handler_start")).toBe(1);
      expect(count(events, "handler_error")).toBe(1);
      // Provider error carries 402 + the normalized class.
      const providerError = events.find((e) => e.event === "provider_error");
      expect(providerError?.httpStatus).toBe(402);
      expect(providerError?.errorCode).toBe("CREDITS_UNAVAILABLE");
      // No retry for credits.
      expect(count(events, "retry_scheduled")).toBe(0);
      // Fallback emitted from the runtime recovery vocabulary.
      const fallback = events.find((e) => e.event === "fallback_selected");
      expect(fallback?.fallbackHint).toMatch(/Search Console/i);
      // Final completion marks the lifecycle failed.
      const completed = events.filter((e) => e.event === "tool_completed");
      expect(completed.length).toBeGreaterThan(0);
      expect(completed.every((e) => e.errorCode !== undefined)).toBe(true);
      logSpy.mockRestore();
    },
  );

  it("event counters yield the required UI data: Handler 1 / Provider 1 / Blocked 2 / Retry NO", () => {
    const { bus } = traceHarness();
    // The exact 402 lifecycle shape the UI must render as ONE tool section.
    bus.push({ event: "model_attempt", toolName: "research_keywords" });
    bus.push({ event: "gate_allowed", toolName: "research_keywords" });
    bus.push({ event: "cache_miss", toolName: "research_keywords" });
    bus.push({ event: "handler_start", toolName: "research_keywords", attempt: 1 });
    bus.push({ event: "provider_request", provider: "dataforseo" });
    bus.push({
      event: "provider_error",
      toolName: "research_keywords",
      provider: "dataforseo",
      httpStatus: 402,
      errorCode: "CREDITS_UNAVAILABLE",
    });
    bus.push({
      event: "handler_error",
      toolName: "research_keywords",
      attempt: 1,
      errorCode: "CREDITS_UNAVAILABLE",
    });
    bus.push({
      event: "fallback_selected",
      toolName: "research_keywords",
      fallbackHint:
        "Search Console queries, saved keywords, cached keyword data, or SERP analysis",
    });
    bus.push({
      event: "tool_completed",
      toolName: "research_keywords",
      errorCode: "CREDITS_UNAVAILABLE",
    });
    bus.push({ event: "model_attempt", toolName: "research_keywords" });
    bus.push({ event: "gate_blocked", toolName: "research_keywords", blocked: true });
    bus.push({ event: "model_attempt", toolName: "research_keywords" });
    bus.push({ event: "gate_blocked", toolName: "research_keywords", blocked: true });

    const events = bus.snapshot()?.events ?? [];
    expect(count(events, "model_attempt")).toBe(3);
    expect(count(events, "handler_start")).toBe(1);
    expect(events.filter((e) => e.event === "provider_request")).toHaveLength(1);
    expect(count(events, "gate_blocked")).toBe(2);
    expect(count(events, "retry_scheduled")).toBe(0);
  });
});

describe("required 40201 trace — access paused, no retry, blocked repeats, fallback", () => {
  it(
    "get_domain_overview: HTTP 200 + app 40201 → one execution, no retry, fallback, then gate blocks",
    { timeout: 10_000 },
    async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { ctx, sleeps } = traceHarness();
      let runs = 0;
      const run = (): Promise<CallToolResult> => {
        runs++;
        return Promise.reject(accessPaused40201());
      };
      const call = (args: unknown) =>
        executeAdaptedTool({
          toolName: "get_domain_overview",
          fullArgs: args,
          ctx,
          run,
          cacheable: true,
        });
      await call({ domain: "powersiment.ae" });
      await call({ domain: "powersiment.ae" });
      // The paused-access failure never consumes retry budget: exactly one
      // handler execution, no automatic retry sleep.
      expect(runs).toBe(1);
      expect(sleeps).toHaveLength(0);

      const snap = getSamTraceBus().snapshot();
      const events = eventsFor(snap?.events ?? [], "get_domain_overview");
      expect(count(events, "model_attempt")).toBe(2);
      expect(count(events, "gate_allowed")).toBe(1);
      expect(count(events, "gate_blocked")).toBe(1);
      expect(count(events, "handler_start")).toBe(1);
      expect(count(events, "handler_error")).toBe(1);
      // The provider error carries the exact low-level cause.
      const providerError = events.find((e) => e.event === "provider_error");
      expect(providerError?.httpStatus).toBe(200);
      expect(providerError?.errorCode).toBe("DATAFORSEO_ACCESS_PAUSED");
      // No automatic retry was scheduled for a paused-access failure.
      expect(count(events, "retry_scheduled")).toBe(0);
      expect(count(events, "retry_executed")).toBe(0);
      // Fallback still executes from the runtime recovery vocabulary.
      const fallback = events.find((e) => e.event === "fallback_selected");
      expect(fallback?.fallbackHint).toMatch(/internal snapshots/i);
      // Final completion marks the lifecycle failed with the new class.
      const completed = events.filter((e) => e.event === "tool_completed");
      expect(completed.length).toBeGreaterThan(0);
      expect(completed.every((e) => e.errorCode !== undefined)).toBe(true);
      logSpy.mockRestore();
    },
  );
});

describe("required 429 trace — retry once, then success", () => {
  it(
    "research_keywords: 429 → one automatic retry → success",
    { timeout: 10_000 },
    async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { ctx, sleeps } = traceHarness();
      let runs = 0;
      const run = (): Promise<CallToolResult> => {
        runs++;
        if (runs === 1)
          return Promise.reject(httpError(429, "too many requests"));
        return Promise.resolve(okResult({ results: [] }));
      };
      const out = await executeAdaptedTool({
        toolName: "research_keywords",
        fullArgs: { seeds: [{ seed: "x" }] },
        ctx,
        run,
        cacheable: true,
      });
      const text = JSON.stringify(out);
      expect(text).not.toContain("rate-limited");
      expect(runs).toBe(2);
      expect(sleeps).toHaveLength(1);

      const snap = getSamTraceBus().snapshot();
      const events = eventsFor(snap?.events ?? [], "research_keywords");
      // One model attempt (retry is automatic, not model-driven).
      expect(count(events, "model_attempt")).toBe(1);
      expect(count(events, "handler_start")).toBe(2);
      expect(count(events, "handler_error")).toBe(1);
      expect(count(events, "retry_scheduled")).toBe(1);
      expect(count(events, "retry_executed")).toBe(1);
      expect(count(events, "handler_success")).toBe(1);
      const providerError = events.find((e) => e.event === "provider_error");
      expect(providerError?.httpStatus).toBe(429);
      expect(providerError?.errorCode).toBe("RATE_LIMITED");
      expect(
        events.some(
          (e) => e.event === "tool_completed" && e.errorCode === undefined,
        ),
      ).toBe(true);
      logSpy.mockRestore();
    },
  );
});

describe("required 503 trace — transient retry, then success", () => {
  it(
    "get_serp_results: 503 → one retry → success, no further attempts",
    { timeout: 10_000 },
    async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { ctx } = traceHarness();
      let runs = 0;
      const run = (): Promise<CallToolResult> => {
        runs++;
        if (runs === 1)
          return Promise.reject(httpError(503, "gateway failure"));
        return Promise.resolve(okResult({ items: [] }));
      };
      const out = await executeAdaptedTool({
        toolName: "get_serp_results",
        fullArgs: { queries: [{ keyword: "x" }] },
        ctx,
        run,
        cacheable: true,
      });
      expect(JSON.stringify(out)).not.toContain("temporary error");
      expect(runs).toBe(2);

      const snap = getSamTraceBus().snapshot();
      const events = eventsFor(snap?.events ?? [], "get_serp_results");
      expect(count(events, "model_attempt")).toBe(1);
      expect(count(events, "retry_scheduled")).toBe(1);
      expect(count(events, "retry_executed")).toBe(1);
      expect(count(events, "handler_success")).toBe(1);
      const providerError = events.find((e) => e.event === "provider_error");
      expect(providerError?.httpStatus).toBe(503);
      expect(providerError?.errorCode).toBe("TRANSIENT_UPSTREAM");
      // No further model attempts after success.
      expect(count(events, "model_attempt")).toBe(1);
      logSpy.mockRestore();
    },
  );
});

describe("secrecy — trace payloads never carry credential material", () => {
  it(
    "a provider error full of secrets produces only sanitized trace fields",
    { timeout: 10_000 },
    async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { ctx } = traceHarness();
      const secret = Object.assign(
        new Error(
          '402 {"user_id":"u_secret","key":"Basic abc123","token":"sk-or-v1-9f8e7d6c"}',
        ),
        { statusCode: 402 },
      );
      await executeAdaptedTool({
        toolName: "get_keyword_metrics",
        fullArgs: {},
        ctx,
        run: () => Promise.reject(secret),
        cacheable: true,
      });
      const traceText = JSON.stringify(
        getSamTraceBus().snapshot()?.events ?? [],
      );
      expect(traceText).not.toContain("u_secret");
      expect(traceText).not.toContain("Basic abc123");
      expect(traceText).not.toContain("sk-or-v1-9f8e7d6c");
      logSpy.mockRestore();
    },
  );
});

describe("provider identity — DataForSEO vs the AI provider vs GSC", () => {
  it(
    "attributes the 402 to the data provider, never the AI provider",
    { timeout: 10_000 },
    async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { ctx, bus } = traceHarness();
      await executeAdaptedTool({
        toolName: "research_keywords",
        fullArgs: {},
        ctx,
        run: () => Promise.reject(billing402()),
        cacheable: true,
      });
      const snap = bus.snapshot();
      // AI identity is the turn header — the data provider is per-event.
      expect(snap?.ai.provider).toBe("Ollama Cloud");
      expect(snap?.ai.model).toBe("kimi-k2.7-code");
      const events = snap?.events ?? [];
      expect(
        events.some(
          (e) => e.event === "provider_error" && e.httpStatus === 402,
        ),
      ).toBe(true);
      // The AI provider never appears in tool events.
      expect(JSON.stringify(events)).not.toContain("Ollama");
      logSpy.mockRestore();
    },
  );

  it("a successful GSC tool completes cleanly with no dataforseo identity", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, bus } = traceHarness();
    await executeAdaptedTool({
      toolName: "get_search_console_performance",
      fullArgs: {},
      ctx,
      run: () => Promise.resolve(okResult({ rows: [] })),
      cacheable: true,
    });
    const events = bus.snapshot()?.events ?? [];
    const gsc = eventsFor(events, "get_search_console_performance");
    expect(count(gsc, "model_attempt")).toBe(1);
    expect(count(gsc, "handler_success")).toBe(1);
    expect(count(gsc, "cache_write")).toBe(1);
    expect(JSON.stringify(gsc)).not.toContain("dataforseo");
    logSpy.mockRestore();
  });
});

describe("blocked attempts group under one tool lifecycle (UI contract)", () => {
  it("three model attempts of one tool yield exactly one tool section", () => {
    const { bus } = traceHarness();
    for (let i = 0; i < 3; i++) {
      bus.push({ event: "model_attempt", toolName: "research_keywords" });
      if (i === 0) {
        bus.push({ event: "gate_allowed", toolName: "research_keywords" });
        bus.push({ event: "cache_miss", toolName: "research_keywords" });
        bus.push({
          event: "handler_start",
          toolName: "research_keywords",
          attempt: 1,
        });
        bus.push({
          event: "provider_error",
          toolName: "research_keywords",
          provider: "dataforseo",
          httpStatus: 402,
          errorCode: "CREDITS_UNAVAILABLE",
        });
        bus.push({
          event: "tool_completed",
          toolName: "research_keywords",
          errorCode: "CREDITS_UNAVAILABLE",
        });
      } else {
        bus.push({
          event: "gate_blocked",
          toolName: "research_keywords",
          blocked: true,
        });
      }
    }
    const events = bus.snapshot()?.events ?? [];
    // Distinct tool names — the grouping key the client reducer uses.
    const toolNames = new Set(
      events.map((e) => e.toolName).filter((t): t is string => t !== undefined),
    );
    expect(toolNames.size).toBe(1);
    expect([...toolNames][0]).toBe("research_keywords");
  });
});
