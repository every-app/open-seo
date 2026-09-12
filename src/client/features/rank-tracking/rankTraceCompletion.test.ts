/* eslint-disable max-lines */
import { describe, expect, it, vi, afterEach } from "vitest";
import { safeTraceId } from "@/client/features/tracing/globalTraceStore";
import {
  formatDataforseoHttpErrorMessage,
  formatDataforseoTaskErrorMessage,
} from "@/shared/dataforseoDiagnosticsParser";
import {
  buildRankCompletionPatch,
  busyBlockedReason,
  classifyRunError,
  providerTaskCount,
  resolveCheckBusyState,
  type RankRowForTrace,
  type RankRunForTrace,
} from "./rankTraceCompletion";

function run(overrides: Partial<RankRunForTrace> = {}): RankRunForTrace {
  return {
    id: "run_1",
    status: "completed",
    keywordsChecked: 1,
    keywordsTotal: 1,
    errorMessage: null,
    startedAt: "2026-09-12T10:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<RankRowForTrace> = {}): RankRowForTrace {
  return {
    trackingKeywordId: "kw_1",
    keyword: "الأطروحة الدكتوراة",
    desktop: {
      position: 5,
      previousPosition: 10,
      checkedAt: "2026-09-12T10:05:00.000Z",
    },
    mobile: null,
    ...overrides,
  };
}

describe("resolveCheckBusyState — every click leaves a trace", () => {
  it("proceeds when idle", () => {
    expect(resolveCheckBusyState({ isPending: false, isRunning: false })).toBe(
      "proceed",
    );
  });

  it("reports busy-inflight while the trigger request is pending", () => {
    expect(resolveCheckBusyState({ isPending: true, isRunning: false })).toBe(
      "busy-inflight",
    );
    expect(busyBlockedReason("busy-inflight")).toMatch(/in flight/i);
  });

  it("reports busy-running while a run is active (must trace, not vanish)", () => {
    expect(resolveCheckBusyState({ isPending: false, isRunning: true })).toBe(
      "busy-running",
    );
    expect(busyBlockedReason("busy-running")).toMatch(/already running/i);
  });
});

describe("providerTaskCount — runtime-derived DataForSEO task count", () => {
  it("issues one live task per keyword for single-device configs", () => {
    expect(providerTaskCount(1, "desktop")).toBe(1);
    expect(providerTaskCount(4, "mobile")).toBe(4);
  });

  it("doubles the task count when both devices are tracked", () => {
    expect(providerTaskCount(1, "both")).toBe(2);
    expect(providerTaskCount(4, "both")).toBe(8);
  });
});

describe("classifyRunError — evidence-based failure classification", () => {
  it("classifies credit/budget wording as CREDITS_UNAVAILABLE + BLOCKED", () => {
    for (const message of [
      "Insufficient credits for rank check",
      "DataForSEO budget exceeded (402)",
      "Payment Required",
      "Upgrade to the paid plan to run rank checks",
    ]) {
      const classified = classifyRunError(message);
      expect(classified.errorClass).toBe("CREDITS_UNAVAILABLE");
      expect(classified.budget).toBe("BLOCKED");
      expect(classified.blockedReason).toBe(message);
    }
  });

  it("keeps unknown failures generic with budget PASS", () => {
    const classified = classifyRunError("1 keyword(s) could not be checked");
    expect(classified.errorClass).toBe("OPERATION_FAILED");
    expect(classified.budget).toBe("PASS");
    expect(classified.blockedReason).toBeUndefined();
  });
});

describe("buildRankCompletionPatch — snapshot-evidence completion", () => {
  it("marks a fresh ranked snapshot as success with positions", () => {
    const patch = buildRankCompletionPatch({
      run: run(),
      rows: [row()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("success");
    expect(patch.rankChecksSucceeded).toBe(1);
    expect(patch.rankChecksFailed).toBe(0);
    expect(patch.children).toHaveLength(1);
    expect(patch.children[0].status).toBe("success");
    expect(patch.children[0].positionBefore).toBe(10);
    expect(patch.children[0].positionAfter).toBe(5);
    // Nothing fabricated: HTTP/task outcomes are unobservable client-side.
    expect(patch.children[0].httpStatus).toBeUndefined();
    expect(patch.children[0].taskStatus).toBeUndefined();
    expect(patch.httpStatus).toBeUndefined();
  });

  it("marks a fresh null-position snapshot as no_result (still success)", () => {
    const patch = buildRankCompletionPatch({
      run: run(),
      rows: [
        row({
          desktop: {
            position: null,
            previousPosition: null,
            checkedAt: "2026-09-12T10:05:00.000Z",
          },
        }),
      ],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("success");
    expect(patch.rankChecksSucceeded).toBe(1);
    expect(patch.children[0].status).toBe("no_result");
    expect(patch.children[0].positionAfter).toBeNull();
  });

  it("marks keywords with no fresh snapshot as failed (never fake success)", () => {
    const patch = buildRankCompletionPatch({
      run: run({
        keywordsChecked: 0,
        errorMessage: "1 keyword(s) could not be checked",
      }),
      rows: [
        row({
          desktop: {
            position: null,
            previousPosition: null,
            checkedAt: null,
          },
        }),
      ],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.rankChecksSucceeded).toBe(0);
    expect(patch.rankChecksFailed).toBe(1);
    expect(patch.children[0].status).toBe("failed");
    expect(patch.errorClass).toBe("OPERATION_FAILED");
  });

  it("ignores stale snapshots from previous runs", () => {
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 0 }),
      rows: [
        row({
          desktop: {
            position: 5,
            previousPosition: 10,
            // Checked BEFORE this run started — not evidence for this run.
            checkedAt: "2026-09-11T10:05:00.000Z",
          },
        }),
      ],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.children[0].status).toBe("failed");
  });

  it("propagates a failed run with its error message", () => {
    const patch = buildRankCompletionPatch({
      run: run({ status: "failed", errorMessage: "Workflow exploded" }),
      rows: [],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.errorMessage).toBe("Workflow exploded");
    expect(patch.errorClass).toBe("OPERATION_FAILED");
  });

  it("classifies a credit-blocked run as BLOCKED with zero provider calls", () => {
    const patch = buildRankCompletionPatch({
      run: run({
        status: "failed",
        keywordsChecked: 0,
        errorMessage: "Insufficient credits for rank check",
      }),
      rows: [],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.errorClass).toBe("CREDITS_UNAVAILABLE");
    expect(patch.budget).toBe("BLOCKED");
    expect(patch.providerCalls).toBe(0);
  });

  it("never zeroes provider calls when snapshots prove execution happened", () => {
    const patch = buildRankCompletionPatch({
      run: run({
        errorMessage: "Completed 1 of 2 keyword(s). Error: credits?",
      }),
      rows: [
        row(),
        row({
          trackingKeywordId: "kw_2",
          desktop: { position: null, previousPosition: null, checkedAt: null },
          mobile: null,
        }),
      ],
      targetIds: ["kw_1", "kw_2"],
    });

    expect(patch.rankChecksSucceeded).toBe(1);
    expect(patch.rankChecksFailed).toBe(1);
    expect(patch.providerCalls).toBeUndefined();
  });

  it("exposes run counts for the progress counters", () => {
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 3, keywordsTotal: 4 }),
      rows: [row()],
      targetIds: ["kw_1"],
    });

    expect(patch.counters).toEqual({ checked: 3, total: 4 });
  });
});

const LIVE_ENDPOINT = "v3/serp/google/organic/live/advanced";

function uncheckedRow(id = "kw_1"): RankRowForTrace {
  return {
    trackingKeywordId: id,
    keyword: "test keyword",
    desktop: { position: null, previousPosition: null, checkedAt: null },
    mobile: null,
  };
}

describe("buildRankCompletionPatch — DataForSEO deep diagnostics", () => {
  it("1. HTTP 500 with body maps provider, endpoint, HTTP, task code, message", () => {
    const message = formatDataforseoHttpErrorMessage(
      500,
      `/${LIVE_ENDPOINT}`,
      "Internal Server Error",
      50000,
    );
    const patch = buildRankCompletionPatch({
      run: run({
        keywordsChecked: 0,
        errorMessage: `Completed 0 of 1 keyword(s). Error: ${message}`,
      }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.httpStatus).toBe(500);
    expect(patch.errorClass).toBe("TRANSIENT_UPSTREAM");
    expect(patch.providers).toHaveLength(1);
    expect(patch.providers?.[0]).toMatchObject({
      provider: "DataForSEO",
      endpoint: LIVE_ENDPOINT,
      httpStatus: 500,
      taskStatus: 50000,
      transport: "HTTP",
      billing: "Paid",
      metered: true,
    });
    expect(patch.providers?.[0].statusMessage).toContain(
      "Internal Server Error",
    );
  });

  it("2. HTTP 500 without body shows transport/server error, null task code", () => {
    const message = formatDataforseoHttpErrorMessage(
      500,
      `/${LIVE_ENDPOINT}`,
      "no response body",
      null,
    );
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 0, errorMessage: message }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.httpStatus).toBe(500);
    expect(patch.errorClass).toBe("TRANSIENT_UPSTREAM");
    expect(patch.providers?.[0].taskStatus).toBeNull();
    expect(patch.providers?.[0].statusMessage).toBe("no response body");
  });

  it("3. HTTP 200 + task error is distinct from HTTP 500", () => {
    const message = formatDataforseoTaskErrorMessage(
      40000,
      "Invalid Field: 'depth'.",
    );
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 0, errorMessage: message }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.httpStatus).toBe(200);
    expect(patch.errorClass).toBe("TASK_ERROR");
    expect(patch.providers?.[0]).toMatchObject({
      provider: "DataForSEO",
      httpStatus: 200,
      taskStatus: 40000,
    });
  });

  it("4. HTTP 402 maps to CREDITS_UNAVAILABLE + BLOCKED with zero calls", () => {
    const message = formatDataforseoHttpErrorMessage(
      402,
      `/${LIVE_ENDPOINT}`,
      "Payment Required.",
      40200,
    );
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 0, errorMessage: message }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.errorClass).toBe("CREDITS_UNAVAILABLE");
    expect(patch.budget).toBe("BLOCKED");
    expect(patch.providerCalls).toBe(0);
    expect(patch.providers?.[0]).toMatchObject({
      httpStatus: 402,
      taskStatus: 40200,
      budgetGuard: "BLOCKED",
    });
  });

  it("5. HTTP 429 maps to RATE_LIMITED without budget block", () => {
    const message = formatDataforseoHttpErrorMessage(
      429,
      `/${LIVE_ENDPOINT}`,
      "Too Many Requests",
      42900,
    );
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 0, errorMessage: message }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.errorClass).toBe("RATE_LIMITED");
    expect(patch.budget).not.toBe("BLOCKED");
    expect(patch.providers?.[0]).toMatchObject({
      httpStatus: 429,
      taskStatus: 42900,
    });
  });

  it("6. successful 200 + task 20000 leaves trigger provider data untouched", () => {
    const patch = buildRankCompletionPatch({
      run: run(),
      rows: [row()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("success");
    // No error ⇒ no provider override: the trigger-time record stands.
    expect(patch.providers).toBeUndefined();
    expect(patch.httpStatus).toBeUndefined();
    expect(patch.errorClass).toBeUndefined();
  });

  it("7. secrets in the failure message are redacted everywhere", () => {
    const message = `${formatDataforseoHttpErrorMessage(
      500,
      `/${LIVE_ENDPOINT}`,
      "Internal Server Error",
      50000,
    )} Authorization: Bearer secret_oauth_token_12345xyz password=hunter2`;
    const patch = buildRankCompletionPatch({
      run: run({ keywordsChecked: 0, errorMessage: message }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    const haystack = JSON.stringify(patch);
    expect(haystack).not.toContain("secret_oauth_token_12345xyz");
    expect(haystack).not.toContain("hunter2");
    expect(haystack).toContain("[redacted]");
  });

  it("transport failures upgrade the label without claiming HTTP", () => {
    const patch = buildRankCompletionPatch({
      run: run({
        keywordsChecked: 0,
        errorMessage: "fetch failed: socket hang up",
      }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.errorClass).toBe("TRANSPORT_ERROR");
    expect(patch.httpStatus).toBeUndefined();
    expect(patch.providers).toBeUndefined();
  });

  it("generic messages stay generic (no fabricated HTTP 500)", () => {
    const patch = buildRankCompletionPatch({
      run: run({
        keywordsChecked: 0,
        errorMessage: "1 keyword(s) could not be checked",
      }),
      rows: [uncheckedRow()],
      targetIds: ["kw_1"],
    });

    expect(patch.status).toBe("failed");
    expect(patch.errorClass).toBe("OPERATION_FAILED");
    expect(patch.httpStatus).toBeUndefined();
    expect(patch.providers).toBeUndefined();
  });
});

describe("safeTraceId — trace failures never break the check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a non-empty id in normal environments", () => {
    expect(safeTraceId()).toMatch(/.+/);
  });

  it("falls back instead of throwing without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => safeTraceId()).not.toThrow();
    expect(safeTraceId()).toMatch(/^trace_/);
  });
});
