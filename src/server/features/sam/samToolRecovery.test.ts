/* eslint-disable max-lines */
import { describe, expect, it, vi } from "vitest";
import { InvalidToolInputError } from "ai";
import { AppError } from "@/server/lib/errors";
import {
  BudgetExceededError,
  ProviderUnavailableError,
  ProviderUnsupportedError,
  RateLimitError,
} from "@/server/lib/seo-data/errors";
import {
  attachDataforseoDiagnostics,
  readDataforseoDiagnostics,
} from "@/server/lib/dataforseo/shared";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import {
  buildToolBlockedMessage,
  buildToolFailureMessage,
  classifyToolError,
  classifyToolErrorText,
  createToolRecoveryState,
  extractRetryAfterSeconds,
  fallbackHintFor,
  retryDelayMs,
  MAX_TOOL_ATTEMPTS_PER_TURN,
  MAX_TOOL_RETRY_DELAY_MS,
} from "./samToolRecovery";
import { classifyToolOutput } from "./samToolBatchOutput";

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode: status });
}

function billing402(): Error {
  return httpError(
    402,
    "DataForSEO HTTP 402 on /v3/keywords_data/google_ads/search_volume/live: payment required, balance is too low",
  );
}

describe("classifyToolError — failure classes", () => {
  it("maps HTTP 402 / billing text to CREDITS_UNAVAILABLE (never retryable)", () => {
    const classified = classifyToolError(billing402());
    expect(classified.failureClass).toBe("CREDITS_UNAVAILABLE");
    expect(classified.retryable).toBe(false);
  });

  it("maps billing AppError codes to CREDITS_UNAVAILABLE", () => {
    for (const code of [
      "PAYMENT_REQUIRED",
      "INSUFFICIENT_CREDITS",
      "BACKLINKS_BILLING_ISSUE",
      "AI_SEARCH_BILLING_ISSUE",
    ] as const) {
      const classified = classifyToolError(new AppError(code, "billing"));
      expect(classified.failureClass).toBe("CREDITS_UNAVAILABLE");
      expect(classified.retryable).toBe(false);
    }
    const budget = classifyToolError(new BudgetExceededError("daily", 5, 5));
    expect(budget.failureClass).toBe("CREDITS_UNAVAILABLE");
  });

  it("maps 429 to RATE_LIMITED (retryable, keeps Retry-After)", () => {
    const classified = classifyToolError(
      Object.assign(httpError(429, "too many requests"), {
        responseHeaders: { "retry-after": "7" },
      }),
    );
    expect(classified.failureClass).toBe("RATE_LIMITED");
    expect(classified.retryable).toBe(true);
    expect(classified.retryAfterSeconds).toBe(7);
  });

  it("maps 5xx to TRANSIENT_UPSTREAM (retryable once)", () => {
    for (const status of [500, 502, 503]) {
      const classified = classifyToolError(
        httpError(status, `upstream blew up (${status})`),
      );
      expect(classified.failureClass).toBe("TRANSIENT_UPSTREAM");
      expect(classified.retryable).toBe(true);
    }
    expect(
      classifyToolError(new RateLimitError("dataforseo")).failureClass,
    ).toBe("RATE_LIMITED");
  });

  it("maps capability/config errors to PERMANENT_UNAVAILABLE (never retry)", () => {
    const unsupported = classifyToolError(
      new ProviderUnsupportedError("dataforseo", "serp", "nope"),
    );
    expect(unsupported.failureClass).toBe("PERMANENT_UNAVAILABLE");
    expect(unsupported.retryable).toBe(false);
    const disabled = classifyToolError(
      new ProviderUnavailableError("dataforseo", "DataForSEO is disabled"),
    );
    expect(disabled.failureClass).toBe("PERMANENT_UNAVAILABLE");
  });
});

describe("classifyToolError — Phase V/U invariants", () => {
  it("keeps InvalidToolInputError as TOOL_INPUT_INVALID (never capability blame)", () => {
    const error = new InvalidToolInputError({
      toolName: "get_serp_results",
      toolInput: JSON.stringify({ queries: ["bare string"] }),
      cause: "bare string query",
    });
    const classified = classifyToolError(error);
    expect(classified.failureClass).toBe("TOOL_INPUT_INVALID");
    expect(classified.retryable).toBe(false);
    const message = buildToolFailureMessage(
      "get_serp_results",
      classified.failureClass,
    );
    expect(message).toContain("Invalid tool arguments for get_serp_results");
    expect(message).not.toContain("does not support");
  });

  it("classifies the exact OpenRouter 402 shape as provider-credit failure text, not a retryable error", () => {
    const error = Object.assign(
      new Error(
        "would exceed your available credits (in_flight_budget_exhausted)",
      ),
      { statusCode: 402 },
    );
    expect(classifyToolError(error).failureClass).toBe("CREDITS_UNAVAILABLE");
  });

  it("classifies HTTP 400 as TOOL_INPUT_INVALID", () => {
    expect(classifyToolError(httpError(400, "bad request")).failureClass).toBe(
      "TOOL_INPUT_INVALID",
    );
  });
});

describe("classifyToolError — DataForSEO diagnostics (low-level cause)", () => {
  it("classifies an AppError by its duck-typed code even when instanceof fails (chunk boundary)", () => {
    // The live-observed UNKNOWN case: an AppError thrown from the lazily
    // loaded DataForSEO SDK chunk, where `instanceof AppError` can fail
    // across module-graph duplication. The duck-typed `code` property keeps
    // the product vocabulary authoritative.
    const crossBoundaryError = Object.assign(
      new Error("DataForSEO HTTP 402 on /v3/dataforseo_labs/google/domain_rank_overview/live"),
      { code: "PAYMENT_REQUIRED" },
    );
    const classified = classifyToolError(crossBoundaryError);
    expect(classified.failureClass).toBe("CREDITS_UNAVAILABLE");
    expect(classified.retryable).toBe(false);
  });

  it("reads HTTP status from attached DataForSEO diagnostics when no statusCode field exists", () => {
    const error = Object.assign(
      new Error("DataForSEO HTTP 500 on /v3/serp/google/organic/live"),
      {
        code: "INTERNAL_ERROR",
        dataforseoDiagnostics: {
          endpoint: "v3/serp/google/organic/live",
          httpStatus: 500,
          dataforseoStatus: null,
        },
      },
    );
    const classified = classifyToolError(error);
    expect(classified.failureClass).toBe("TRANSIENT_UPSTREAM");
    expect(classified.code).toBe("HTTP_500");
  });

  it("a 429 in diagnostics classifies RATE_LIMITED, not UNKNOWN", () => {
    const error = Object.assign(new Error("DataForSEO HTTP 429"), {
      dataforseoDiagnostics: { httpStatus: 429 },
    });
    const classified = classifyToolError(error);
    expect(classified.failureClass).toBe("RATE_LIMITED");
  });

  it("a 402 in diagnostics classifies CREDITS_UNAVAILABLE, not UNKNOWN", () => {
    const error = Object.assign(new Error("DataForSEO HTTP 402"), {
      dataforseoDiagnostics: {
        httpStatus: 402,
        dataforseoStatus: 20000,
        dataforseoMessage: "Ok.",
      },
    });
    const classified = classifyToolError(error);
    expect(classified.failureClass).toBe("CREDITS_UNAVAILABLE");
    expect(classified.code).toBe("HTTP_402");
  });

  it("transport failures (httpStatus=null) stay TRANSIENT_UPSTREAM via text, never credits", () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND api.dataforseo.com"), {
      dataforseoDiagnostics: {
        httpStatus: null,
        transportError: "DNS_LOOKUP_FAILED",
      },
    });
    const classified = classifyToolError(error);
    expect(classified.failureClass).toBe("TRANSIENT_UPSTREAM");
  });
});

describe("classifyToolError — DataForSEO 40201 access-paused (dedicated class)", () => {
  /** The live-observed get_domain_overview shape: HTTP 200 + task 40201. */
  function accessPaused40201(message = "Account access temporarily paused."): Error {
    return attachDataforseoDiagnostics(new Error(message), {
      endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
      api: "dataforseo_labs",
      httpStatus: 200,
      dataforseoStatus: 40201,
      dataforseoMessage: message,
      request: { target: "powersiment.ae", locationCode: 2784, languageCode: "ar" },
    });
  }

  it("HTTP 200 + app 40201 classifies DATAFORSEO_ACCESS_PAUSED, never transient", () => {
    const classified = classifyToolError(accessPaused40201());
    expect(classified.failureClass).toBe("DATAFORSEO_ACCESS_PAUSED");
    expect(classified.code).toBe("APP_40201");
    expect(classified.retryable).toBe(false);
  });

  it("a real charged-task 40201 error classifies access-paused, not credits", () => {
    const error = attachDataforseoDiagnostics(
      new DataforseoChargedTaskError(
        "Account access temporarily paused.",
        { path: ["v3", "dataforseo_labs", "google", "domain_rank_overview", "live"], costUsd: 0 },
      ),
      {
        endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
        httpStatus: 200,
        dataforseoStatus: 40201,
        dataforseoMessage: "Account access temporarily paused.",
      },
    );
    expect(readDataforseoDiagnostics(error)?.dataforseoStatus).toBe(40201);
    const classified = classifyToolError(error);
    expect(classified.failureClass).toBe("DATAFORSEO_ACCESS_PAUSED");
    expect(classified.retryable).toBe(false);
  });

  it("the exact status code wins over billing-worded message text", () => {
    // Even if a 40201 message mentioned billing/balance words, the attached
    // application status_code — not a text heuristic — decides the class.
    const classified = classifyToolError(
      accessPaused40201("Payment required — balance is too low, account paused"),
    );
    expect(classified.failureClass).toBe("DATAFORSEO_ACCESS_PAUSED");
    expect(classified.code).toBe("APP_40201");
  });

  it("blocks the turn on first strike without consuming retry budget", () => {
    const recovery = createToolRecoveryState();
    const verdict = recovery.recordFailure(
      "get_domain_overview",
      classifyToolError(accessPaused40201()),
    );
    expect(verdict.retryAllowed).toBe(false);
    expect(verdict.unavailableForTurn).toBe(true);
    expect(recovery.canAttempt("get_domain_overview").allowed).toBe(false);
    const state = recovery.getState("get_domain_overview");
    expect(state?.lastFailureClass).toBe("DATAFORSEO_ACCESS_PAUSED");
    // Only one handler execution happened — no automatic retry was spent.
    expect(state?.attempts).toBe(1);
  });

  it("free-text batch outputs keep existing semantics (no fabricated access-paused)", () => {
    // Batch item errors are plain strings without attached diagnostics, so
    // the 40201 code path can never fire here — the text ladder decides.
    const classified = classifyToolOutput({
      summary: "batch done",
      data: {
        results: [
          { keyword: "a", ok: false, error: "socket hang up" },
          {
            keyword: "b",
            ok: false,
            error: "DataForSEO HTTP 500 on /v3/serp/google/organic/live",
          },
        ],
      },
    });
    expect(classified?.failureClass).toBe("TRANSIENT_UPSTREAM");
  });

  it("model-facing messages name the pause and forbid retry", () => {
    const failure = buildToolFailureMessage(
      "get_domain_overview",
      "DATAFORSEO_ACCESS_PAUSED",
    );
    expect(failure).toMatch(/temporarily paused API access/);
    expect(failure).toMatch(/Do not retry/);
    const blocked = buildToolBlockedMessage("get_domain_overview", {
      toolName: "get_domain_overview",
      attempts: 1,
      lastFailureClass: "DATAFORSEO_ACCESS_PAUSED",
      lastErrorCode: "APP_40201",
      unavailableForTurn: true,
      retryable: false,
    });
    expect(blocked).toMatch(/DATAFORSEO_ACCESS_PAUSED/);
    expect(blocked).toMatch(/Do not retry/);
  });
});

describe("classifyToolError — payment/rate-limit/transient taxonomy preserved", () => {
  it("HTTP 402 transport + 40200/40210 app statuses stay CREDITS_UNAVAILABLE", () => {
    expect(
      classifyToolError(new AppError("PAYMENT_REQUIRED", "DataForSEO HTTP 402")).failureClass,
    ).toBe("CREDITS_UNAVAILABLE");
    for (const appStatus of [40200, 40210]) {
      const error = attachDataforseoDiagnostics(new Error("Payment Required."), {
        endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
        httpStatus: 200,
        dataforseoStatus: appStatus,
        dataforseoMessage: "Payment Required.",
      });
      expect(classifyToolError(error).failureClass).toBe("CREDITS_UNAVAILABLE");
    }
  });

  it("429 keeps exactly one retry; 5xx keeps exactly one retry", () => {
    const limited = classifyToolError(httpError(429, "too many requests"));
    expect(limited.failureClass).toBe("RATE_LIMITED");
    expect(limited.retryable).toBe(true);
    const transient = classifyToolError(httpError(503, "gateway failure"));
    expect(transient.failureClass).toBe("TRANSIENT_UPSTREAM");
    expect(transient.retryable).toBe(true);
  });
});

describe("classifyToolOutput — all-failed batches", () => {
  it("treats an all-failed batch with billing errors as CREDITS_UNAVAILABLE", () => {
    const classified = classifyToolOutput(
      batchOutput(["payment required, balance is too low"]),
    );
    expect(classified?.failureClass).toBe("CREDITS_UNAVAILABLE");
  });

  it("ignores partial success and non-batch shapes", () => {
    expect(
      classifyToolOutput({
        summary: "x",
        data: {
          results: [
            { keyword: "a", ok: true, items: [] },
            { keyword: "b", ok: false, error: "payment required" },
          ],
        },
      }),
    ).toBeNull();
    expect(
      classifyToolOutput({ summary: "ok", data: { results: [] } }),
    ).toBeNull();
    expect(classifyToolOutput({ summary: "plain" })).toBeNull();
  });
});

function batchOutput(errors: string[]): unknown {
  return {
    summary: "batch done",
    data: {
      results: errors.map((error, index) => ({
        keyword: `seed-${index}`,
        ok: false as const,
        error,
      })),
    },
  };
}

describe("retryDelayMs — bounded waits, no test stalls", () => {
  it("caps hostile Retry-After values", () => {
    const hostile = classifyToolError(
      Object.assign(httpError(429, "slow down"), {
        responseHeaders: { "retry-after": "99999" },
      }),
    );
    expect(hostile.retryAfterSeconds).toBeLessThanOrEqual(600);
    expect(retryDelayMs(hostile)).toBe(MAX_TOOL_RETRY_DELAY_MS);
    const sane = classifyToolError(
      Object.assign(httpError(429, "slow down"), {
        responseHeaders: { "retry-after": "2" },
      }),
    );
    expect(retryDelayMs(sane)).toBe(2000);
  });

  it("reads Retry-After from nested header maps and enforces the attempt budget", () => {
    expect(
      extractRetryAfterSeconds({
        responseHeaders: { "Retry-After": "12" },
      }),
    ).toBe(12);
    expect(extractRetryAfterSeconds({})).toBeNull();
    // The per-turn budget is exactly one retry: initial + one more attempt.
    expect(MAX_TOOL_ATTEMPTS_PER_TURN).toBe(2);
  });
});

describe("model-facing messages — compact, actionable, secret-free", () => {
  it("blocked 402 names the tool, forbids retry, and points at fallbacks", () => {
    const recovery = createToolRecoveryState();
    recovery.recordFailure(
      "research_keywords",
      classifyToolError(billing402()),
    );
    const state = recovery.getState("research_keywords");
    expect(state?.unavailableForTurn).toBe(true);
    const blocked = buildToolBlockedMessage(
      "research_keywords",
      // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted just above
      state!,
    );
    expect(blocked).toContain("research_keywords");
    expect(blocked).toContain("CREDITS_UNAVAILABLE");
    expect(blocked).toContain("Do not retry");
    expect(blocked).toContain(fallbackHintFor("research_keywords"));
  });

  it("never echoes raw provider text (ids, payloads, stacks)", () => {
    const raw = Object.assign(
      new Error(
        '402 {"user_id":"user_secret_123","headers":{"Authorization":"Basic xyz"}}',
      ),
      { statusCode: 402 },
    );
    const message = buildToolFailureMessage(
      "research_keywords",
      classifyToolError(raw).failureClass,
    );
    expect(message).not.toContain("user_secret_123");
    expect(message).not.toContain("Authorization");
    expect(message).toContain("credits unavailable");
  });
});

describe("createToolRecoveryState — per-turn budgets", () => {
  it("blocks the second 402 call even with different arguments", () => {
    const recovery = createToolRecoveryState();
    expect(recovery.canAttempt("research_keywords").allowed).toBe(true);
    recovery.recordFailure(
      "research_keywords",
      classifyToolError(billing402()),
    );
    const gate = recovery.canAttempt("research_keywords");
    expect(gate.allowed).toBe(false);
    expect(gate.blocked).toContain("unavailable for this turn");
  });

  it("allows one input correction, then blocks the loop", () => {
    const recovery = createToolRecoveryState();
    const input = classifyToolErrorText("Invalid tool arguments: limit wrong");
    expect(input.failureClass).toBe("TOOL_INPUT_INVALID");
    const first = recovery.recordFailure("list_saved_keywords", input);
    expect(first.unavailableForTurn).toBe(false);
    expect(recovery.canAttempt("list_saved_keywords").allowed).toBe(true);
    const second = recovery.recordFailure("list_saved_keywords", input);
    expect(second.unavailableForTurn).toBe(true);
    expect(recovery.canAttempt("list_saved_keywords").allowed).toBe(false);
  });

  it("counts SDK-level input rejections toward the same budget", () => {
    const recovery = createToolRecoveryState();
    recovery.recordInputRejection("get_serp_results");
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(true);
    recovery.recordInputRejection("get_serp_results");
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(false);
  });

  it("gives 429/5xx exactly one retry, then blocks", () => {
    const recovery = createToolRecoveryState();
    const limited = classifyToolError(httpError(429, "too many requests"));
    const first = recovery.recordFailure("get_serp_results", limited);
    expect(first.retryAllowed).toBe(true);
    expect(first.unavailableForTurn).toBe(false);
    const second = recovery.recordFailure("get_serp_results", limited);
    expect(second.retryAllowed).toBe(false);
    expect(second.unavailableForTurn).toBe(true);
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(false);
  });

  it("a successful retry clears the transient failure", () => {
    const recovery = createToolRecoveryState();
    recovery.recordFailure(
      "get_serp_results",
      classifyToolError(httpError(503, "gateway failure")),
    );
    recovery.recordSuccess("get_serp_results");
    expect(recovery.getState("get_serp_results")).toBeUndefined();
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(true);
  });

  it("reset() scopes failure to the turn — next turn retries freely", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const recovery = createToolRecoveryState();
    recovery.recordFailure(
      "research_keywords",
      classifyToolError(billing402()),
    );
    expect(recovery.canAttempt("research_keywords").allowed).toBe(false);
    recovery.reset();
    expect(recovery.canAttempt("research_keywords").allowed).toBe(true);
    logSpy.mockRestore();
  });

  it("leaves unrelated tools usable", () => {
    const recovery = createToolRecoveryState();
    recovery.recordFailure(
      "research_keywords",
      classifyToolError(billing402()),
    );
    expect(recovery.canAttempt("get_search_console_performance").allowed).toBe(
      true,
    );
    expect(recovery.getState("get_search_console_performance")).toBeUndefined();
  });

  it("one tool blocked leaves all other tools usable (Case D)", () => {
    // SDK-level rejection for tool A must not affect tool B.
    const recovery = createToolRecoveryState();
    recovery.recordInputRejection("list_saved_keywords");
    recovery.recordInputRejection("list_saved_keywords");
    // Tool A is blocked.
    expect(recovery.canAttempt("list_saved_keywords").allowed).toBe(false);
    expect(recovery.getState("list_saved_keywords")?.unavailableForTurn).toBe(
      true,
    );
    // Tool B is untouched.
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(true);
    expect(recovery.getState("get_serp_results")).toBeUndefined();
  });
});

describe("input-rejection gate_blocked condition", () => {
  it("gate_blocked only fires when the tool is actually unavailable", () => {
    // Verifies the recovery policy that SamChatAgent's callback reads to
    // decide whether to emit the gate_blocked trace event.
    const recovery = createToolRecoveryState();

    // First SDK rejection → still available → no gate_blocked.
    recovery.recordInputRejection("get_serp_results");
    expect(recovery.getState("get_serp_results")?.unavailableForTurn).toBe(
      false,
    );
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(true);

    // Second rejection → unavailable → gate_blocked fires.
    recovery.recordInputRejection("get_serp_results");
    expect(recovery.getState("get_serp_results")?.unavailableForTurn).toBe(
      true,
    );
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(false);

    // The full trace wiring (normalizer → dedup → callback → trace bus) is
    // exercised by the Phase V test in samStreamErrorSeam.test.ts.
  });
});

describe("input-rejection + execution — Phase V correction flow", () => {
  it("one SDK double-fire rejection allows the corrected model attempt", async () => {
    // The normalizer dedups upstream (one recordInputRejection per SDK
    // invalid tool call), but even at the recovery level: one rejection
    // does NOT block. The corrected model attempt executes normally.
    const recovery = createToolRecoveryState();
    recovery.recordInputRejection("list_saved_keywords");
    expect(recovery.canAttempt("list_saved_keywords").allowed).toBe(true);
    expect(recovery.getState("list_saved_keywords")?.unavailableForTurn).toBe(
      false,
    );
    // Success clears the failure entirely — the tool is fully usable again.
    recovery.recordSuccess("list_saved_keywords");
    expect(recovery.getState("list_saved_keywords")).toBeUndefined();
  });
});
