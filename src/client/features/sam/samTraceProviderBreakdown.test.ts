import { describe, expect, it } from "vitest";

import type {
  SamToolTraceEvent,
  SamTraceFrame,
} from "@/shared/samToolTraceTypes";
import { reduceTraceFrame, type TraceToolView } from "./samTraceReducer";
import {
  formatProviderBreakdown,
  providerDisplayLabel,
} from "./samTraceFormat";

// Provider-breakdown tests (Phase DT — observability enhancement): the
// breakdown must be derived EXCLUSIVELY from provider_request events, sum
// exactly to providerCalls, and never count cache hits, gate blocks, model
// attempts, or fallback hints. Ordering is deterministic (first-seen).

let seq = 0;
function ev(
  event: SamToolTraceEvent["event"],
  fields: Partial<SamToolTraceEvent> = {},
): SamToolTraceEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    turnId: "turn_pb",
    timestamp: Date.now(),
    sequence: seq,
    event,
    ...fields,
  };
}

function frame(events: SamToolTraceEvent[]): SamTraceFrame {
  return {
    type: "sam_trace",
    events,
    ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
  };
}

function toolOf(view: ReturnType<typeof reduceTraceFrame>): TraceToolView {
  const tool = view.tools[0];
  if (!tool) throw new Error("no tool in view");
  return tool;
}

/** Standard lifecycle prefix for one real handler execution. */
function attemptPrefix(tool: string): SamToolTraceEvent[] {
  return [
    ev("model_attempt", { toolName: tool }),
    ev("gate_allowed", { toolName: tool }),
    ev("handler_start", { toolName: tool, attempt: 1 }),
  ];
}

/** Breakdown sums exactly to providerCalls (invariant, every test). */
function assertSumEquals(tool: TraceToolView): void {
  expect(
    tool.providerBreakdown.reduce((n, e) => n + e.calls, 0),
  ).toBe(tool.providerCalls);
}

describe("provider breakdown — reducer derivation (core counting)", () => {
  it("1. single provider: GSC ×1", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("get_search_console_performance"),
        ev("provider_request", {
          toolName: "get_search_console_performance",
          provider: "gsc",
        }),
        ev("provider_success", {
          toolName: "get_search_console_performance",
          provider: "gsc",
          durationMs: 800,
        }),
        ev("tool_completed", {
          toolName: "get_search_console_performance",
          durationMs: 820,
        }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.providerCalls).toBe(1);
    expect(tool.providerBreakdown).toEqual([{ provider: "gsc", calls: 1 }]);
    assertSumEquals(tool);
    expect(formatProviderBreakdown(tool.providerBreakdown)).toBe("GSC ×1");
  });

  it("2. two providers: Internal ×1 · DataForSEO ×1", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("get_domain_overview"),
        ev("provider_request", { toolName: "get_domain_overview", provider: "internal" }),
        ev("provider_success", { toolName: "get_domain_overview", provider: "internal" }),
        ev("provider_request", { toolName: "get_domain_overview", provider: "dataforseo" }),
        ev("provider_error", {
          toolName: "get_domain_overview",
          provider: "dataforseo",
          httpStatus: 503,
        }),
        ev("tool_completed", { toolName: "get_domain_overview" }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.providerCalls).toBe(2);
    expect(tool.providerBreakdown).toEqual([
      { provider: "internal", calls: 1 },
      { provider: "dataforseo", calls: 1 },
    ]);
    assertSumEquals(tool);
  });

  it("3. four calls: Internal ×2 · DataForSEO ×2 (retry case)", () => {
    const events: SamToolTraceEvent[] = [
      ...attemptPrefix("get_domain_overview"),
      ev("provider_request", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_success", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_request", { toolName: "get_domain_overview", provider: "dataforseo" }),
      ev("provider_error", {
        toolName: "get_domain_overview",
        provider: "dataforseo",
        httpStatus: 503,
        errorCode: "TRANSIENT_UPSTREAM",
      }),
      ev("handler_error", {
        toolName: "get_domain_overview",
        errorCode: "TRANSIENT_UPSTREAM",
      }),
      ev("retry_scheduled", { toolName: "get_domain_overview", retryAllowed: true }),
      ev("retry_executed", { toolName: "get_domain_overview", attempt: 2 }),
      ev("handler_start", { toolName: "get_domain_overview", attempt: 2 }),
      ev("provider_request", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_success", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_request", { toolName: "get_domain_overview", provider: "dataforseo" }),
      ev("provider_error", {
        toolName: "get_domain_overview",
        provider: "dataforseo",
        httpStatus: 503,
        errorCode: "TRANSIENT_UPSTREAM",
      }),
      ev("handler_error", {
        toolName: "get_domain_overview",
        errorCode: "TRANSIENT_UPSTREAM",
      }),
      ev("fallback_selected", {
        toolName: "get_domain_overview",
        fallbackHint: "internal snapshots, cached data",
      }),
      ev("tool_completed", {
        toolName: "get_domain_overview",
        errorCode: "TRANSIENT_UPSTREAM",
      }),
    ];
    const view = reduceTraceFrame(frame(events));
    const tool = toolOf(view);
    expect(tool.handlerExecutions).toBe(2);
    expect(tool.providerCalls).toBe(4);
    expect(tool.providerBreakdown).toEqual([
      { provider: "internal", calls: 2 },
      { provider: "dataforseo", calls: 2 },
    ]);
    expect(tool.retriesExecuted).toBe(1);
    assertSumEquals(tool);
    expect(formatProviderBreakdown(tool.providerBreakdown)).toBe(
      "Internal ×2 · DataForSEO ×2",
    );
  });

  it("4. zero providers: no breakdown (internal-only tool)", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("get_audit_status"),
        ev("handler_success", { toolName: "get_audit_status", attempt: 1 }),
        ev("tool_completed", { toolName: "get_audit_status", durationMs: 5 }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.handlerExecutions).toBe(1);
    expect(tool.providerCalls).toBe(0);
    expect(tool.providerBreakdown).toEqual([]);
    expect(formatProviderBreakdown(tool.providerBreakdown)).toBeNull();
  });

  it("5. cache hit: provider count unchanged", () => {
    // Dedup hit — handler=0, provider=0, breakdown empty.
    const view = reduceTraceFrame(
      frame([
        ev("model_attempt", { toolName: "list_saved_keywords" }),
        ev("gate_allowed", { toolName: "list_saved_keywords" }),
        ev("cache_hit", { toolName: "list_saved_keywords", cacheHit: true }),
        ev("tool_completed", {
          toolName: "list_saved_keywords",
          cacheHit: true,
          durationMs: 4,
        }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.providerCalls).toBe(0);
    expect(tool.providerBreakdown).toEqual([]);
    // Router cache events also never enter the breakdown.
    const view2 = reduceTraceFrame(
      frame([
        ...attemptPrefix("research_keywords"),
        ev("cache_miss", { toolName: "research_keywords", provider: "cache" }),
        ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
        ev("provider_success", { toolName: "research_keywords", provider: "dataforseo" }),
        ev("cache_write", { toolName: "research_keywords", provider: "cache" }),
        ev("tool_completed", { toolName: "research_keywords" }),
      ]),
    );
    const tool2 = toolOf(view2);
    expect(tool2.providerCalls).toBe(1);
    expect(tool2.providerBreakdown).toEqual([{ provider: "dataforseo", calls: 1 }]);
  });

  it("6. blocked retry: provider count unchanged", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("research_keywords"),
        ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
        ev("provider_error", {
          toolName: "research_keywords",
          provider: "dataforseo",
          httpStatus: 402,
          errorCode: "CREDITS_UNAVAILABLE",
        }),
        ev("handler_error", { toolName: "research_keywords", errorCode: "CREDITS_UNAVAILABLE" }),
        ev("tool_completed", { toolName: "research_keywords", errorCode: "CREDITS_UNAVAILABLE" }),
        ev("model_attempt", { toolName: "research_keywords" }),
        ev("gate_blocked", { toolName: "research_keywords", blocked: true }),
        ev("model_attempt", { toolName: "research_keywords" }),
        ev("gate_blocked", { toolName: "research_keywords", blocked: true }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.modelAttempts).toBe(3);
    expect(tool.blockedRetries).toBe(2);
    expect(tool.providerCalls).toBe(1);
    expect(tool.providerBreakdown).toEqual([{ provider: "dataforseo", calls: 1 }]);
    assertSumEquals(tool);
  });  it("7. fallback hint without execution: does not count provider", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("research_keywords"),
        ev("provider_error", {
          toolName: "research_keywords",
          provider: "dataforseo",
          httpStatus: 402,
        }),
        ev("fallback_selected", {
          toolName: "research_keywords",
          fallbackHint: "Search Console queries, SERP analysis",
        }),
        ev("tool_completed", { toolName: "research_keywords", errorCode: "CREDITS_UNAVAILABLE" }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.fallback).toContain("Search Console");
    // A fallback hint (and even a provider_error with no preceding
    // provider_request) never enters the breakdown — breakdown counts
    // actual provider execution attempts (provider_request events) only.
    expect(tool.providerBreakdown).toEqual([]);
    expect(tool.providerCalls).toBe(0);
  });

  it("8. actual fallback execution: counts provider", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("research_keywords"),
        ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
        ev("provider_error", {
          toolName: "research_keywords",
          provider: "dataforseo",
          httpStatus: 402,
          errorCode: "CREDITS_UNAVAILABLE",
        }),
        ev("fallback_selected", {
          toolName: "research_keywords",
          fallbackHint: "Search Console queries",
        }),
        ev("provider_request", { toolName: "research_keywords", provider: "gsc" }),
        ev("provider_success", { toolName: "research_keywords", provider: "gsc" }),
        ev("tool_completed", { toolName: "research_keywords" }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.providerCalls).toBe(2);
    expect(tool.providerBreakdown).toEqual([
      { provider: "dataforseo", calls: 1 },
      { provider: "gsc", calls: 1 },
    ]);
    assertSumEquals(tool);
  });

  it("9. multiple retries: provider attempts counted correctly", () => {
    const events: SamToolTraceEvent[] = [
      ...attemptPrefix("get_serp_results"),
      ...[1, 2, 3].flatMap(() => [
        ev("provider_request", { toolName: "get_serp_results", provider: "dataforseo" }),
        ev("provider_error", {
          toolName: "get_serp_results",
          provider: "dataforseo",
          httpStatus: 429,
          errorCode: "RATE_LIMITED",
        }),
      ]),
      ev("retry_scheduled", { toolName: "get_serp_results", retryAllowed: true }),
      ev("retry_executed", { toolName: "get_serp_results", attempt: 2 }),
      ev("retry_scheduled", { toolName: "get_serp_results", retryAllowed: true }),
      ev("retry_executed", { toolName: "get_serp_results", attempt: 3 }),
      ev("tool_completed", {
        toolName: "get_serp_results",
        errorCode: "RATE_LIMITED",
      }),
    ];
    const view = reduceTraceFrame(frame(events));
    const tool = toolOf(view);
    expect(tool.providerCalls).toBe(3);
    expect(tool.providerBreakdown).toEqual([{ provider: "dataforseo", calls: 3 }]);
    expect(tool.retriesExecuted).toBe(2);
    assertSumEquals(tool);
  });
});

describe("provider breakdown — ordering, identity, secrecy", () => {
  it("11. deterministic ordering: first-seen execution order, stable", () => {
    const events: SamToolTraceEvent[] = [
      ...attemptPrefix("get_domain_overview"),
      ev("provider_request", { toolName: "get_domain_overview", provider: "dataforseo" }),
      ev("provider_error", { toolName: "get_domain_overview", provider: "dataforseo" }),
      ev("provider_request", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_success", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_request", { toolName: "get_domain_overview", provider: "internal" }),
      ev("provider_success", { toolName: "get_domain_overview", provider: "internal" }),
      ev("tool_completed", { toolName: "get_domain_overview" }),
    ];
    const first = reduceTraceFrame(frame(events));
    const second = reduceTraceFrame(frame(events));
    expect(first.tools[0]?.providerBreakdown).toEqual([
      { provider: "dataforseo", calls: 1 },
      { provider: "internal", calls: 2 },
    ]);
    // Deterministic: same events → identical order (no object-key ordering).
    expect(second.tools[0]?.providerBreakdown).toEqual(
      first.tools[0]?.providerBreakdown,
    );
  });

  it("12. unknown provider: sanitized canonical id shown", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("future_tool"),
        ev("provider_request", { toolName: "future_tool", provider: "new_vendor_v2" }),
        ev("provider_success", { toolName: "future_tool", provider: "new_vendor_v2" }),
        ev("tool_completed", { toolName: "future_tool" }),
      ]),
    );
    const tool = toolOf(view);
    expect(tool.providerBreakdown).toEqual([
      { provider: "new_vendor_v2", calls: 1 },
    ]);
    expect(formatProviderBreakdown(tool.providerBreakdown)).toBe(
      "new_vendor_v2 ×1",
    );
    expect(providerDisplayLabel("new_vendor_v2")).toBe("new_vendor_v2");
  });

  it("13. AI provider is never included in tool breakdown", () => {
    // Breakdown derives from provider_request events only — the frame's AI
    // header (Ollama Cloud) never appears as a tool provider.
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("get_domain_overview"),
        ev("provider_request", { toolName: "get_domain_overview", provider: "internal" }),
        ev("provider_success", { toolName: "get_domain_overview", provider: "internal" }),
        ev("provider_request", { toolName: "get_domain_overview", provider: "dataforseo" }),
        ev("provider_success", { toolName: "get_domain_overview", provider: "dataforseo" }),
        ev("tool_completed", { toolName: "get_domain_overview" }),
      ]),
    );
    const tool = toolOf(view);
    expect(view.ai.provider).toBe("Ollama Cloud");
    const names = tool.providerBreakdown.map((e) => e.provider);
    expect(names).toEqual(["internal", "dataforseo"]);
    expect(names).not.toContain("Ollama Cloud");
    const rendered = formatProviderBreakdown(tool.providerBreakdown) ?? "";
    expect(rendered).not.toContain("Ollama");
    expect(rendered).toBe("Internal ×1 · DataForSEO ×1");
  });

  it("14. no secret leakage in breakdown rendering", () => {
    const view = reduceTraceFrame(
      frame([
        ...attemptPrefix("research_keywords"),
        // A poisoned provider id: the label util passes it through unchanged
        // (join-only formatting) — the server bus remains the scrub authority.
        ev("provider_request", {
          toolName: "research_keywords",
          provider: "Bearer sk-or-v1-secret",
        }),
        ev("tool_completed", { toolName: "research_keywords" }),
      ]),
    );
    const tool = toolOf(view);
    const rendered = formatProviderBreakdown(tool.providerBreakdown) ?? "";
    expect(rendered).toContain("×1");
    expect(rendered.length).toBeGreaterThan(0);
  });
});

describe("provider breakdown — labels", () => {
  it("maps canonical ids to friendly labels", () => {
    expect(providerDisplayLabel("dataforseo")).toBe("DataForSEO");
    expect(providerDisplayLabel("gsc")).toBe("GSC");
    expect(providerDisplayLabel("google_ads")).toBe("Google Ads");
    expect(providerDisplayLabel("bing_webmaster")).toBe("Bing Webmaster");
    expect(providerDisplayLabel("internal")).toBe("Internal");
    expect(providerDisplayLabel("local_crawler")).toBe("Local Crawler");
    expect(providerDisplayLabel("anything_else")).toBe("anything_else");
  });

  it("formats single and multi-provider compactly, null for empty", () => {
    expect(formatProviderBreakdown([])).toBeNull();
    expect(formatProviderBreakdown([{ provider: "gsc", calls: 1 }])).toBe("GSC ×1");
    expect(
      formatProviderBreakdown([
        { provider: "internal", calls: 2 },
        { provider: "dataforseo", calls: 2 },
      ]),
    ).toBe("Internal ×2 · DataForSEO ×2");
  });
});
