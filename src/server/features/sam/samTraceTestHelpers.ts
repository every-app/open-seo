import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { createToolExecutionTracker } from "./samToolExecution";
import { createToolRecoveryState } from "./samToolRecovery";
import type { GuardedExecuteContext } from "./samGuardedToolExecute";
import { getSamTraceBus, resetSamTraceBus } from "./samTraceBus";
import type { SamToolTraceEvent } from "@/shared/samToolTraceTypes";
import { attachDataforseoDiagnostics } from "@/server/lib/dataforseo/shared";

// Shared harness for the Debug Trace instrumentation tests: the singleton
// trace bus (what the production seams read) with a fresh turn + a guarded
// execution context, plus the event filters the suites assert through.

export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode: status });
}

export function billing402(): Error {
  return httpError(
    402,
    "DataForSEO HTTP 402 on /v3/keywords_data: payment required, balance is too low",
  );
}

/**
 * The live-observed get_domain_overview 40201 shape: HTTP 200 + task
 * status_code 40201, surfaced as a charged-task error with the sanitized
 * diagnostics record the envelope seam attaches (plus the DataRouter's
 * providerErrorSource stamp).
 */
export function accessPaused40201(): Error {
  return attachDataforseoDiagnostics(
    Object.assign(new Error("Account access temporarily paused."), {
      providerErrorSource: "dataforseo",
    }),
    {
      endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
      api: "dataforseo_labs",
      httpStatus: 200,
      dataforseoStatus: 40201,
      dataforseoMessage: "Account access temporarily paused.",
      request: { target: "powersiment.ae", locationCode: 2784, languageCode: "ar" },
    },
  );
}

export function okResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: "summary" }],
    structuredContent: structured,
  };
}

/** Fresh per-test harness: the singleton bus + recovery context. */
export function traceHarness() {
  resetSamTraceBus();
  const bus = getSamTraceBus();
  bus.startTurn({
    ai: { provider: "Ollama Cloud", model: "kimi-k2.7-code" },
  });
  const recovery = createToolRecoveryState("s", "p");
  const sleeps: number[] = [];
  const ctx: GuardedExecuteContext = {
    projectId: "p",
    tracker: createToolExecutionTracker({ sessionId: "s", projectId: "p" }),
    sessionId: "s",
    recovery,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
  return { ctx, recovery, sleeps, bus };
}

/** Filter snapshot events for one tool, by name, in emission order. */
export function eventsFor(
  events: SamToolTraceEvent[],
  toolName: string,
): SamToolTraceEvent[] {
  return events.filter((e) => e.toolName === toolName);
}

export function count(
  events: SamToolTraceEvent[],
  name: SamToolTraceEvent["event"],
): number {
  return events.filter((e) => e.event === name).length;
}
