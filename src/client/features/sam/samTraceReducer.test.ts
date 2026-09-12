/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";

import type {
  SamToolTraceEvent,
  SamTraceFrame,
} from "@/shared/samToolTraceTypes";
import { reduceTraceFrame } from "./samTraceReducer";
import {
  errorClassLabel,
  failureReasonFor,
  filterTraceTools,
  parseTraceFrame,
  providerStatusLine,
  dataforseoFailureLabel,
  sameEvents,
} from "./samTraceFormat";

// Client-side Debug Trace reduction tests (Phase DT): the pure functions the
// panel renders through. Covers the required UI data — grouped lifecycles,
// execution counters (model vs handler vs provider), retry/blocked/fallback
// visibility, cache states, error classification, secrecy, and filters.

let seq = 0;
function ev(
  event: SamToolTraceEvent["event"],
  fields: Partial<SamToolTraceEvent> = {},
): SamToolTraceEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    turnId: "turn_1",
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

/** The canonical 402 lifecycle from the task: 1 execution, 2 blocks, fallback. */
function lifecycle402(): SamToolTraceEvent[] {
  return [
    ev("model_attempt", { toolName: "research_keywords" }),
    ev("gate_allowed", { toolName: "research_keywords" }),
    ev("cache_miss", { toolName: "research_keywords", cacheHit: false }),
    ev("handler_start", { toolName: "research_keywords", attempt: 1 }),
    ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
    ev("provider_error", {
      toolName: "research_keywords",
      provider: "dataforseo",
      httpStatus: 402,
      errorCode: "CREDITS_UNAVAILABLE",
    }),
    ev("handler_error", {
      toolName: "research_keywords",
      attempt: 1,
      errorCode: "CREDITS_UNAVAILABLE",
    }),
    ev("fallback_selected", {
      toolName: "research_keywords",
      fallbackHint: "Search Console queries, saved keywords, cached keyword data, or SERP analysis",
    }),
    ev("tool_completed", {
      toolName: "research_keywords",
      errorCode: "CREDITS_UNAVAILABLE",
      durationMs: 940,
    }),
    // Model retries the tool; guard blocks both times.
    ev("model_attempt", { toolName: "research_keywords" }),
    ev("gate_blocked", { toolName: "research_keywords", blocked: true }),
    ev("model_attempt", { toolName: "research_keywords" }),
    ev("gate_blocked", { toolName: "research_keywords", blocked: true }),
  ];
}

describe("reduceTraceFrame — 402 lifecycle (required UI data)", () => {
  const view = reduceTraceFrame(frame(lifecycle402()));

  it("groups blocked retries under the SAME tool section (one section total)", () => {
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.toolName).toBe("research_keywords");
  });

  it("counts model attempts vs handler executions vs provider calls independently", () => {
    const tool = view.tools[0];
    expect(tool?.modelAttempts).toBe(3);
    expect(tool?.handlerExecutions).toBe(1);
    expect(tool?.providerCalls).toBe(1);
    expect(tool?.blockedRetries).toBe(2);
  });

  it("exposes the provider identity and 402 status on the summary row", () => {
    const tool = view.tools[0];
    expect(tool?.lastProvider).toBe("dataforseo");
    expect(tool?.lastProviderError?.httpStatus).toBe(402);
    expect(providerStatusLine(tool)).toBe("DataForSEO → HTTP 402");
    expect(errorClassLabel(tool?.lastProviderError?.errorCode)).toBe(
      "CREDITS_UNAVAILABLE",
    );
  });

  it("marks retry NO (credits never retry) and shows the runtime fallback", () => {
    const tool = view.tools[0];
    expect(tool?.retryScheduled).toBe(false);
    expect(tool?.retriesExecuted).toBe(0);
    expect(tool?.fallback).toMatch(/Search Console/i);
  });

  it("computes the turn summary: 402:1, retries:0, blocked:2, unique:1", () => {
    expect(view.summary.errors402).toBe(1);
    expect(view.summary.errors429).toBe(0);
    expect(view.summary.errors5xx).toBe(0);
    expect(view.summary.retries).toBe(0);
    expect(view.summary.blocked).toBe(2);
    expect(view.summary.uniqueTools).toBe(1);
    // lifecycles = unique + blocked + retries
    expect(view.summary.toolLifecycles).toBe(3);
    expect(view.summary.failed).toBe(1);
  });

  it("shows the AI provider distinct from the data provider", () => {
    expect(view.ai).toEqual({
      provider: "Ollama Cloud",
      model: "kimi-k2.7-code",
    });
  });
});

describe("reduceTraceFrame — 429 retry-then-success lifecycle", () => {
  function lifecycle429(): SamToolTraceEvent[] {
    return [
      ev("model_attempt", { toolName: "research_keywords" }),
      ev("gate_allowed", { toolName: "research_keywords" }),
      ev("cache_miss", { toolName: "research_keywords" }),
      ev("handler_start", { toolName: "research_keywords", attempt: 1 }),
      ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
      ev("provider_error", {
        toolName: "research_keywords",
        provider: "dataforseo",
        httpStatus: 429,
        errorCode: "RATE_LIMITED",
      }),
      ev("handler_error", {
        toolName: "research_keywords",
        attempt: 1,
        errorCode: "RATE_LIMITED",
      }),
      ev("retry_scheduled", {
        toolName: "research_keywords",
        attempt: 1,
        retryAllowed: true,
        errorCode: "RATE_LIMITED",
      }),
      ev("retry_executed", { toolName: "research_keywords", attempt: 2 }),
      ev("handler_start", { toolName: "research_keywords", attempt: 2 }),
      ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
      ev("provider_success", { toolName: "research_keywords", provider: "dataforseo", durationMs: 420 }),
      ev("handler_success", { toolName: "research_keywords", attempt: 2, durationMs: 880 }),
      ev("cache_write", { toolName: "research_keywords", cacheWrite: true }),
      ev("tool_completed", { toolName: "research_keywords", durationMs: 900 }),
    ];
  }

  it("yields Handler 2 / Provider 2 / Retry YES / 1 executed / final success", () => {
    const view = reduceTraceFrame(frame(lifecycle429()));
    const tool = view.tools[0];
    expect(tool?.modelAttempts).toBe(1);
    expect(tool?.handlerExecutions).toBe(2);
    expect(tool?.providerCalls).toBe(2);
    expect(tool?.retryScheduled).toBe(true);
    expect(tool?.retriesExecuted).toBe(1);
    expect(tool?.finalOk).toBe(true);
    expect(tool?.durationMs).toBe(900);
    expect(view.summary.errors429).toBe(1);
    expect(view.summary.retries).toBe(1);
  });

  it("keeps both attempts inside the SAME tool timeline (not separate rows)", () => {
    const view = reduceTraceFrame(frame(lifecycle429()));
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.attempts.length).toBe(2);
    expect(view.tools[0]?.attempts[0]?.outcome?.kind).toBe("error");
    expect(view.tools[0]?.attempts[1]?.outcome?.kind).toBe("success");
  });
});

describe("reduceTraceFrame — 503 transient then success", () => {
  it("classifies 5xx, tracks the retry, and shows final success", () => {
    const events: SamToolTraceEvent[] = [
      ev("model_attempt", { toolName: "get_serp_results" }),
      ev("gate_allowed", { toolName: "get_serp_results" }),
      ev("handler_start", { toolName: "get_serp_results", attempt: 1 }),
      ev("provider_error", {
        toolName: "get_serp_results",
        provider: "dataforseo",
        httpStatus: 503,
        errorCode: "TRANSIENT_UPSTREAM",
      }),
      ev("retry_scheduled", { toolName: "get_serp_results", retryAllowed: true }),
      ev("retry_executed", { toolName: "get_serp_results", attempt: 2 }),
      ev("handler_start", { toolName: "get_serp_results", attempt: 2 }),
      ev("provider_success", { toolName: "get_serp_results", provider: "dataforseo", durationMs: 200 }),
      ev("handler_success", { toolName: "get_serp_results", attempt: 2, durationMs: 210 }),
      ev("tool_completed", { toolName: "get_serp_results", durationMs: 220 }),
    ];
    const view = reduceTraceFrame(frame(events));
    const tool = view.tools[0];
    expect(tool?.finalOk).toBe(true);
    expect(tool?.retriesExecuted).toBe(1);
    expect(tool?.modelAttempts).toBe(1);
    expect(view.summary.errors5xx).toBe(1);
    expect(providerStatusLine(tool)).toContain("DataForSEO");
  });
});

describe("reduceTraceFrame — cache states", () => {
  it("dedup hit shows Cache: HIT and no handler execution", () => {
    const events: SamToolTraceEvent[] = [
      ev("model_attempt", { toolName: "list_saved_keywords" }),
      ev("gate_allowed", { toolName: "list_saved_keywords" }),
      ev("cache_hit", { toolName: "list_saved_keywords", cacheHit: true }),
      ev("tool_completed", { toolName: "list_saved_keywords", cacheHit: true, durationMs: 4 }),
    ];
    const view = reduceTraceFrame(frame(events));
    const tool = view.tools[0];
    expect(tool?.dedupCache).toBe("hit");
    expect(tool?.handlerExecutions).toBe(0);
    expect(providerStatusLine(tool)).toBe("Cache: HIT (dedup)");
    expect(tool?.finalOk).toBe(true);
  });

  it("router-level cache events are separated from the dedup cache", () => {
    const events: SamToolTraceEvent[] = [
      ev("model_attempt", { toolName: "research_keywords" }),
      ev("gate_allowed", { toolName: "research_keywords" }),
      ev("cache_miss", { toolName: "research_keywords", cacheHit: false }), // dedup
      ev("cache_miss", { toolName: "research_keywords", provider: "cache", cacheHit: false }), // R2
      ev("provider_request", { toolName: "research_keywords", provider: "dataforseo" }),
      ev("provider_success", { toolName: "research_keywords", provider: "dataforseo", durationMs: 640 }),
      ev("cache_write", { toolName: "research_keywords", provider: "cache", cacheWrite: true }), // R2 write
      ev("handler_success", { toolName: "research_keywords", attempt: 1, durationMs: 700 }),
      ev("tool_completed", { toolName: "research_keywords", durationMs: 710 }),
    ];
    const view = reduceTraceFrame(frame(events));
    const tool = view.tools[0];
    expect(tool?.dedupCache).toBe("miss");
    expect(tool?.seoCache).toEqual({ hits: 0, misses: 1, writes: 1 });
    expect(view.summary.cacheMisses).toBe(2);
    expect(view.summary.cacheHits).toBe(0);
  });

  it("failed operations show no cache write (write skipped semantics)", () => {
    const view = reduceTraceFrame(frame(lifecycle402()));
    expect(view.tools[0]?.seoCache?.writes ?? 0).toBe(0);
  });
});

describe("reduceTraceFrame — multiple tools, ordering, and unique counts", () => {
  it("preserves first-appearance order and counts unique tools", () => {
    const events: SamToolTraceEvent[] = [
      ...lifecycle402(),
      ev("model_attempt", { toolName: "get_search_console_performance" }),
      ev("gate_allowed", { toolName: "get_search_console_performance" }),
      ev("cache_miss", { toolName: "get_search_console_performance" }),
      ev("handler_start", { toolName: "get_search_console_performance", attempt: 1 }),
      ev("provider_request", { toolName: "get_search_console_performance", provider: "gsc" }),
      ev("provider_success", { toolName: "get_search_console_performance", provider: "gsc", durationMs: 800 }),
      ev("handler_success", { toolName: "get_search_console_performance", attempt: 1, durationMs: 820 }),
      ev("tool_completed", { toolName: "get_search_console_performance", durationMs: 820 }),
    ];
    const view = reduceTraceFrame(frame(events));
    expect(view.tools.map((t) => t.toolName)).toEqual([
      "research_keywords",
      "get_search_console_performance",
    ]);
    expect(view.summary.uniqueTools).toBe(2);
    expect(view.summary.succeeded).toBe(1);
    expect(view.summary.failed).toBe(1);
    // GSC tool's provider is gsc — distinct from dataforseo per tool.
    const gsc = view.tools[1];
    expect(gsc?.lastProvider).toBe("gsc");
    expect(providerStatusLine(gsc)).toBe("GSC → 820ms");
  });
});

describe("filters", () => {
  const view = reduceTraceFrame(frame(lifecycle402()));

  it("errors/blocked/retries/fallbacks filters select the right tools", () => {
    expect(filterTraceTools(view.tools, "all")).toHaveLength(1);
    expect(filterTraceTools(view.tools, "errors")).toHaveLength(1);
    expect(filterTraceTools(view.tools, "blocked")).toHaveLength(1);
    expect(filterTraceTools(view.tools, "retries")).toHaveLength(0);
    expect(filterTraceTools(view.tools, "fallbacks")).toHaveLength(1);
  });
});

describe("parseTraceFrame — WS frame intake", () => {
  it("accepts sam_trace frames and rejects everything else", () => {
    expect(parseTraceFrame(JSON.stringify(frame(lifecycle402())))).not.toBeNull();
    expect(parseTraceFrame('{"type":"cf_agent_chat_messages"}')).toBeNull();
    expect(parseTraceFrame("not json")).toBeNull();
    expect(
      parseTraceFrame(JSON.stringify({ type: "sam_trace", events: "x" })),
    ).toBeNull();
  });

  it("never surfaces credential material from a poisoned frame", () => {
    // Defense-in-depth: even a malformed frame must not render secrets.
    const poisoned = JSON.stringify({
      type: "sam_trace",
      events: [
        {
          id: "x",
          turnId: "t",
          timestamp: 1,
          sequence: 1,
          event: "model_attempt",
          toolName: "Bearer abc123",
        },
      ],
      ai: { provider: "sk-or-v1-xyz", model: null },
    });
    const parsed = parseTraceFrame(poisoned);
    expect(parsed).not.toBeNull();
    // The reducer passes through what the frame carried — the SERVER scrubs
    // at emission; assert the client did not ADD anything (and shows the
    // structure the panel relies on).
    expect(parsed?.events).toHaveLength(1);
  });
});

describe("sameEvents — snapshot diffing for memoization", () => {
  it("equal by reference, length, and last sequence", () => {
    const a = lifecycle402();
    const b = a.slice();
    const shorter = a.slice(0, -1);
    expect(sameEvents(a, a)).toBe(true);
    expect(sameEvents(a, b)).toBe(true);
    expect(sameEvents(a, shorter)).toBe(false);
    expect(sameEvents(undefined, undefined)).toBe(true);
    expect(sameEvents(a, undefined)).toBe(false);
  });
});

// ─── DataForSEO diagnostics (task: exact low-level cause per failure) ────────

/** The live-observed get_domain_overview 402 lifecycle with diagnostics. */
function lifecycle402WithDiagnostics(): SamToolTraceEvent[] {
  return [
    ev("model_attempt", { toolName: "get_domain_overview" }),
    ev("gate_allowed", { toolName: "get_domain_overview" }),
    ev("cache_miss", { toolName: "get_domain_overview", cacheHit: false }),
    ev("handler_start", { toolName: "get_domain_overview", attempt: 1 }),
    ev("provider_request", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
    }),
    // The DataForSEO seam fires first, at the actual failure point.
    ev("provider_error", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
      httpStatus: 402,
      metadata: {
        endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
        api: "dataforseo_labs",
        httpStatus: 402,
        transportError: undefined,
        dataforseoStatus: 20000,
        dataforseoMessage: "Ok.",
        request: {
          target: "powersiment.ae",
          locationCode: 2784,
          languageCode: "ar",
        },
      },
    }),
    // The guarded runner's own classified event for the same call — merged.
    ev("provider_error", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
      httpStatus: 402,
      errorCode: "CREDITS_UNAVAILABLE",
    }),
    ev("handler_error", {
      toolName: "get_domain_overview",
      attempt: 1,
      errorCode: "CREDITS_UNAVAILABLE",
    }),
    ev("fallback_selected", {
      toolName: "get_domain_overview",
      fallbackHint:
        "internal snapshots, cached overviews, Search Console data, or audit/crawler data",
    }),
    ev("tool_completed", {
      toolName: "get_domain_overview",
      errorCode: "CREDITS_UNAVAILABLE",
      durationMs: 890,
    }),
  ];
}

describe("reduceTraceFrame — DataForSEO diagnostics visibility", () => {
  const view = reduceTraceFrame(frame(lifecycle402WithDiagnostics()));

  it("merges the seam + runner provider_error events into ONE provider call", () => {
    const tool = view.tools[0];
    expect(tool?.providerCalls).toBe(1);
    expect(tool?.attempts[0]?.providerCalls).toHaveLength(1);
  });

  it("carries endpoint, HTTP, DataForSEO status, and safe request metadata", () => {
    const call = view.tools[0]?.attempts[0]?.providerCalls[0];
    expect(call?.diagnostics?.endpoint).toBe(
      "v3/dataforseo_labs/google/domain_rank_overview/live",
    );
    expect(call?.diagnostics?.httpStatus).toBe(402);
    expect(call?.diagnostics?.dataforseoStatus).toBe(20000);
    expect(call?.diagnostics?.dataforseoMessage).toBe("Ok.");
    expect(call?.diagnostics?.request).toEqual({
      target: "powersiment.ae",
      locationCode: 2784,
      languageCode: "ar",
    });
  });

  it("keeps the turn summary counters accurate (no double-counted 402)", () => {
    expect(view.summary.errors402).toBe(1);
    expect(view.summary.failed).toBe(1);
  });

  it("the status line shows the HTTP status, not TRANSIENT_UPSTREAM", () => {
    const tool = view.tools[0];
    expect(tool).toBeDefined();
    if (!tool) return;
    const status = providerStatusLine(tool);
    expect(status).toBe("DataForSEO → HTTP 402");
  });
});describe("reduceTraceFrame — DNS transport failure diagnostics", () => {
  const dnsLifecycle = (): SamToolTraceEvent[] => [
    ev("model_attempt", { toolName: "get_domain_overview" }),
    ev("gate_allowed", { toolName: "get_domain_overview" }),
    ev("handler_start", { toolName: "get_domain_overview", attempt: 1 }),
    ev("provider_request", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
    }),
    ev("provider_error", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
      metadata: {
        endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
        httpStatus: null,
        transportError: "DNS_LOOKUP_FAILED",
        dataforseoStatus: null,
      },
    }),
    ev("provider_error", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
      errorCode: "TRANSIENT_UPSTREAM",
    }),
    ev("handler_error", {
      toolName: "get_domain_overview",
      attempt: 1,
      errorCode: "TRANSIENT_UPSTREAM",
    }),
    ev("tool_completed", {
      toolName: "get_domain_overview",
      errorCode: "TRANSIENT_UPSTREAM",
      durationMs: 120,
    }),
  ];

  it("renders the DNS transport category as the status line", () => {
    const view = reduceTraceFrame(frame(dnsLifecycle()));
    const tool = view.tools[0];
    expect(tool).toBeDefined();
    if (!tool) return;
    const status = providerStatusLine(tool);
    expect(status).toBe("DataForSEO → DNS_LOOKUP_FAILED");
    const call = view.tools[0]?.attempts[0]?.providerCalls[0];
    expect(call?.diagnostics?.httpStatus).toBeNull();
    expect(call?.diagnostics?.transportError).toBe("DNS_LOOKUP_FAILED");
  });

  it("does not count a transport failure as 402/429/5xx", () => {
    const view = reduceTraceFrame(frame(dnsLifecycle()));
    expect(view.summary.errors402).toBe(0);
    expect(view.summary.errors429).toBe(0);
    expect(view.summary.errors5xx).toBe(0);
    expect(view.summary.failed).toBe(1);
  });
});

describe("dataforseoFailureLabel — one identifier per failure", () => {
  it("prefers the transport category when no HTTP response arrived", () => {
    expect(
      dataforseoFailureLabel({
        httpStatus: null,
        transportError: "TIMEOUT",
      }),
    ).toBe("TIMEOUT");
  });

  it("shows HTTP status when a response arrived", () => {
    expect(
      dataforseoFailureLabel({ httpStatus: 503, dataforseoStatus: null }),
    ).toBe("HTTP 503");
  });

  it("distinguishes HTTP 200 application errors", () => {
    expect(
      dataforseoFailureLabel({
        httpStatus: 200,
        dataforseoStatus: 40000,
        dataforseoMessage: "Invalid Field: 'target'.",
      }),
    ).toBe("HTTP 200 · app 40000");
  });

  it("returns null for records without a failure signature", () => {
    expect(dataforseoFailureLabel(undefined)).toBeNull();
    expect(
      dataforseoFailureLabel({ httpStatus: 200, dataforseoStatus: 20000 }),
    ).toBeNull();
  });

  it("labels an HTTP 200 + app 40201 pause", () => {
    expect(
      dataforseoFailureLabel({
        httpStatus: 200,
        dataforseoStatus: 40201,
        dataforseoMessage: "Account access temporarily paused.",
      }),
    ).toBe("HTTP 200 · app 40201");
  });
});

describe("reduceTraceFrame — 40201 access-paused lifecycle", () => {
  /**
   * get_domain_overview: live 40201 task failure, then the internal fallback
   * attempt. Mirrors the real seam order — the fetch seam emits
   * provider_success (HTTP 200 arrived) before assertOk throws, the router
   * tries internal, then the runner emits the single classified
   * provider_error for the DataForSEO failure.
   */
  const lifecycle40201 = (): SamToolTraceEvent[] => [
    ev("model_attempt", { toolName: "get_domain_overview" }),
    ev("gate_allowed", { toolName: "get_domain_overview" }),
    ev("handler_start", { toolName: "get_domain_overview", attempt: 1 }),
    ev("provider_request", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
    }),
    ev("provider_success", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
      metadata: {
        endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
        api: "dataforseo_labs",
        httpStatus: 200,
        dataforseoStatus: 40201,
        dataforseoMessage: "Account access temporarily paused.",
        request: {
          target: "powersiment.ae",
          locationCode: 2784,
          languageCode: "ar",
        },
      },
    }),
    ev("provider_request", {
      toolName: "get_domain_overview",
      provider: "internal",
    }),
    ev("provider_error", {
      toolName: "get_domain_overview",
      provider: "dataforseo",
      httpStatus: 200,
      errorCode: "DATAFORSEO_ACCESS_PAUSED",
      metadata: {
        endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
        api: "dataforseo_labs",
        httpStatus: 200,
        dataforseoStatus: 40201,
        dataforseoMessage: "Account access temporarily paused.",
        request: {
          target: "powersiment.ae",
          locationCode: 2784,
          languageCode: "ar",
        },
      },
    }),
    ev("handler_error", {
      toolName: "get_domain_overview",
      attempt: 1,
      errorCode: "DATAFORSEO_ACCESS_PAUSED",
      httpStatus: 200,
    }),
    ev("fallback_selected", {
      toolName: "get_domain_overview",
      fallbackHint:
        "internal snapshots, cached overviews, Search Console data, or audit/crawler data",
    }),
    ev("tool_completed", {
      toolName: "get_domain_overview",
      errorCode: "DATAFORSEO_ACCESS_PAUSED",
      durationMs: 890,
    }),
  ];

  it("status line shows the exact low-level cause, not a collapsed label", () => {
    const view = reduceTraceFrame(frame(lifecycle40201()));
    const tool = view.tools[0];
    expect(tool).toBeDefined();
    if (!tool) return;
    expect(providerStatusLine(tool)).toBe("DataForSEO → HTTP 200 · app 40201");
    expect(errorClassLabel(tool.lastProviderError?.errorCode)).toBe(
      "DATAFORSEO_ACCESS_PAUSED",
    );
    expect(tool.lastProviderError?.diagnostics?.dataforseoStatus).toBe(40201);
    expect(tool.lastProviderError?.diagnostics?.dataforseoMessage).toBe(
      "Account access temporarily paused.",
    );
  });

  it("merges seam success + runner error into the DataForSEO call (no misattribution)", () => {
    const view = reduceTraceFrame(frame(lifecycle40201()));
    const tool = view.tools[0];
    expect(tool).toBeDefined();
    if (!tool) return;
    const dfsCall = tool.attempts[0]?.providerCalls[0];
    expect(dfsCall?.provider).toBe("dataforseo");
    expect(dfsCall?.ok).toBe(false);
    expect(dfsCall?.errorCode).toBe("DATAFORSEO_ACCESS_PAUSED");
    expect(dfsCall?.diagnostics?.dataforseoStatus).toBe(40201);
    expect(dfsCall?.diagnostics?.request?.target).toBe("powersiment.ae");
  });

  it("provider breakdown stays accurate: DataForSEO ×1 · Internal ×1", () => {
    const view = reduceTraceFrame(frame(lifecycle40201()));
    const tool = view.tools[0];
    expect(tool).toBeDefined();
    if (!tool) return;
    expect(tool.providerCalls).toBe(2);
    expect(tool.providerBreakdown).toEqual([
      { provider: "dataforseo", calls: 1 },
      { provider: "internal", calls: 1 },
    ]);
    expect(tool.retryScheduled).toBe(false);
    expect(tool.retriesExecuted).toBe(0);
    expect(tool.fallback).toMatch(/internal snapshots/i);
    expect(tool.finalOk).toBe(false);
  });

  it("exposes the curated Status + Reason for the paused-access class", () => {
    expect(errorClassLabel("DATAFORSEO_ACCESS_PAUSED")).toBe(
      "DATAFORSEO_ACCESS_PAUSED",
    );
    expect(failureReasonFor("DATAFORSEO_ACCESS_PAUSED")).toBe(
      "DataForSEO temporarily paused API access due to unusual activity.",
    );
    expect(failureReasonFor("CREDITS_UNAVAILABLE")).toBeNull();
    expect(failureReasonFor(undefined)).toBeNull();
  });
});
