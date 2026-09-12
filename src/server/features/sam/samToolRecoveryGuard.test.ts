import { describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { AppError } from "@/server/lib/errors";
import { createToolExecutionTracker } from "./samToolExecution";
import {
  createToolRecoveryState,
  MAX_TOOL_RETRY_DELAY_MS,
} from "./samToolRecovery";
import {
  executeAdaptedTool,
  type GuardedExecuteContext,
} from "./samGuardedToolExecute";

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode: status });
}

function billing402(): Error {
  return httpError(
    402,
    "DataForSEO HTTP 402 on /v3/keywords_data: payment required, balance is too low",
  );
}

function okResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: "summary" }],
    structuredContent: structured,
  };
}

function batchFailedResult(error: string): CallToolResult {
  return okResult({
    results: [{ seed: "dubai loans", ok: false as const, error }],
  });
}

function testCtx() {
  const recovery = createToolRecoveryState("s", "p");
  const sleeps: number[] = [];
  const ctx: GuardedExecuteContext = {
    projectId: "p",
    tracker: createToolExecutionTracker({ sessionId: "s", projectId: "p" }),
    sessionId: "s",
    recovery,
    sleep: (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
  return { ctx, recovery, sleeps };
}

function recoveryNoticeOf(output: unknown): unknown {
  if (
    typeof output === "object" &&
    output !== null &&
    "recoveryNotice" in output
  ) {
    return (output as { recoveryNotice: unknown }).recoveryNotice;
  }
  return undefined;
}

function errorTextOf(output: unknown): string {
  if (typeof output === "object" && output !== null && "error" in output) {
    const value = (output as { error: unknown }).error;
    return typeof value === "string" ? value : String(value);
  }
  return "";
}

describe("executeAdaptedTool — 402 credit guard", () => {
  it("blocks the immediate retry with identical arguments (one execution)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.reject(billing402());
    };
    const args = { seeds: [{ seed: "a" }] };
    const first = await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: args,
      ctx,
      run,
      cacheable: true,
    });
    expect(errorTextOf(first)).toContain("credits unavailable");
    expect(runs).toBe(1);
    const second = await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: args,
      ctx,
      run,
      cacheable: true,
    });
    expect(errorTextOf(second)).toContain("unavailable for this turn");
    expect(errorTextOf(second)).toContain("Do not retry");
    expect(runs).toBe(1);
    logSpy.mockRestore();
  });

  it("blocks the retry with different arguments too", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.reject(billing402());
    };
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: { seeds: [{ seed: "a" }] },
      ctx,
      run,
      cacheable: true,
    });
    const retry = await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: { seeds: [{ seed: "different seed" }] },
      ctx,
      run,
      cacheable: true,
    });
    expect(errorTextOf(retry)).toContain("CREDITS_UNAVAILABLE");
    expect(runs).toBe(1);
    logSpy.mockRestore();
  });

  it("treats an all-failed billing batch as unavailable without caching it", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.resolve(
        batchFailedResult("payment required, balance is too low"),
      );
    };
    const args = { seeds: [{ seed: "a" }] };
    const first = await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: args,
      ctx,
      run,
      cacheable: true,
    });
    expect(recoveryNoticeOf(first)).toContain("credits unavailable");
    // The failure must not be cached as a success — and the retry is blocked.
    expect(ctx.tracker.getCached("research_keywords", args)).toBeUndefined();
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: args,
      ctx,
      run,
      cacheable: true,
    });
    expect(runs).toBe(1);
    logSpy.mockRestore();
  });
});

describe("executeAdaptedTool — input errors keep Phase V correction", () => {
  it("allows one correction, then succeeds", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, recovery } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      if (runs === 1) return Promise.reject(new AppError("VALIDATION_ERROR"));
      return Promise.resolve(okResult({ keywords: [{ keyword: "fixed" }] }));
    };
    const call = (fullArgs: unknown): Promise<unknown> =>
      executeAdaptedTool({
        toolName: "list_saved_keywords",
        fullArgs,
        ctx,
        run,
        cacheable: true,
      });
    expect(errorTextOf(await call({ limit: 200 }))).toContain(
      "Invalid tool arguments",
    );
    expect(recovery.canAttempt("list_saved_keywords").allowed).toBe(true);
    const corrected = await call({ limit: 100 });
    expect(runs).toBe(2);
    expect(errorTextOf(corrected)).toBe("");
    logSpy.mockRestore();
  });

  it("stops the loop after the corrected attempt fails again", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.reject(new AppError("VALIDATION_ERROR"));
    };
    const call = (fullArgs: unknown): Promise<unknown> =>
      executeAdaptedTool({
        toolName: "list_saved_keywords",
        fullArgs,
        ctx,
        run,
        cacheable: true,
      });
    await call({ limit: 200 });
    await call({ limit: 500 });
    const third = await call({ limit: 100 });
    expect(errorTextOf(third)).toContain(
      "already failed input validation twice",
    );
    expect(runs).toBe(2);
    logSpy.mockRestore();
  });
});

describe("executeAdaptedTool — 429 / 5xx single retry", () => {
  it("retries 429 exactly once, then blocks model-driven repeats", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, sleeps } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.reject(httpError(429, "too many requests"));
    };
    const call = (): Promise<unknown> =>
      executeAdaptedTool({
        toolName: "get_serp_results",
        fullArgs: { queries: [{ keyword: "x" }] },
        ctx,
        run,
        cacheable: true,
      });
    expect(errorTextOf(await call())).toContain("rate-limited");
    expect(runs).toBe(2);
    expect(sleeps).toHaveLength(1);
    expect(errorTextOf(await call())).toContain(
      "One retry was already attempted",
    );
    expect(errorTextOf(await call())).toContain("Do not retry again");
    expect(runs).toBe(2);
    logSpy.mockRestore();
  });

  it("caps the Retry-After wait and retries 503 once", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, sleeps } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      return Promise.reject(
        Object.assign(httpError(503, "gateway failure"), {
          responseHeaders: { "retry-after": "3600" },
        }),
      );
    };
    const out = await executeAdaptedTool({
      toolName: "get_domain_overview",
      fullArgs: { domain: "example.com" },
      ctx,
      run,
      cacheable: true,
    });
    expect(errorTextOf(out)).toContain("temporary error");
    expect(runs).toBe(2);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeLessThanOrEqual(MAX_TOOL_RETRY_DELAY_MS);
    logSpy.mockRestore();
  });

  it("a successful retry stays available (no false unavailable)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, recovery } = testCtx();
    let runs = 0;
    const run = (): Promise<CallToolResult> => {
      runs++;
      if (runs === 1) return Promise.reject(httpError(503, "gateway failure"));
      return Promise.resolve(okResult({ items: [] }));
    };
    const out = await executeAdaptedTool({
      toolName: "get_serp_results",
      fullArgs: { queries: [{ keyword: "x" }] },
      ctx,
      run,
      cacheable: true,
    });
    expect(errorTextOf(out)).toBe("");
    expect(runs).toBe(2);
    expect(recovery.getState("get_serp_results")).toBeUndefined();
    expect(recovery.canAttempt("get_serp_results").allowed).toBe(true);
    logSpy.mockRestore();
  });
});

describe("executeAdaptedTool — isolation and secrecy", () => {

  it("keeps other tools usable and never leaks raw provider text", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, recovery } = testCtx();
    const failing = (): Promise<CallToolResult> => Promise.reject(billing402());
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: {},
      ctx,
      run: failing,
      cacheable: true,
    });
    let gscRuns = 0;
    const gsc = await executeAdaptedTool({
      toolName: "get_search_console_performance",
      fullArgs: {},
      ctx,
      run: () => {
        gscRuns++;
        return Promise.resolve(okResult({ rows: [] }));
      },
      cacheable: true,
    });
    expect(gscRuns).toBe(1);
    expect(errorTextOf(gsc)).toBe("");
    expect(recovery.getState("get_search_console_performance")).toBeUndefined();

    const secret = Object.assign(
      new Error('402 {"user_id":"u_secret","key":"Basic abc123"}'),
      { statusCode: 402 },
    );
    const leaked = await executeAdaptedTool({
      toolName: "get_keyword_metrics",
      fullArgs: {},
      ctx,
      run: () => Promise.reject(secret),
      cacheable: true,
    });
    const text = errorTextOf(leaked);
    expect(text).not.toContain("u_secret");
    expect(text).not.toContain("Basic abc123");
    logSpy.mockRestore();
  });

  it("never enters an infinite loop under repeated attempts", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx } = testCtx();
    let creditRuns = 0;
    const creditRun = (): Promise<CallToolResult> => {
      creditRuns++;
      return Promise.reject(billing402());
    };
    for (let i = 0; i < 10; i++) {
      await executeAdaptedTool({
        toolName: "research_keywords",
        fullArgs: { n: i },
        ctx,
        run: creditRun,
        cacheable: true,
      });
    }
    expect(creditRuns).toBe(1);

    const { ctx: ctx2 } = testCtx();
    let transientRuns = 0;
    const transientRun = (): Promise<CallToolResult> => {
      transientRuns++;
      return Promise.reject(httpError(503, "gateway failure"));
    };
    for (let i = 0; i < 10; i++) {
      await executeAdaptedTool({
        toolName: "get_serp_results",
        fullArgs: { n: i },
        ctx: ctx2,
        run: transientRun,
        cacheable: true,
      });
    }
    // One automatic retry inside the first model-driven call, then blocked.
    expect(transientRuns).toBe(2);
    logSpy.mockRestore();
  });

  it("a fresh turn (reset) can attempt the tool again", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, recovery } = testCtx();
    const failing = (): Promise<CallToolResult> => Promise.reject(billing402());
    await executeAdaptedTool({
      toolName: "research_keywords",
      fullArgs: {},
      ctx,
      run: failing,
      cacheable: true,
    });
    recovery.reset();
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
    logSpy.mockRestore();
  });
});
