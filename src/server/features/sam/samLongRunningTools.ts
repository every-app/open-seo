import { tool } from "ai";
import { z } from "zod";
import { withPgClient } from "@/db";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { getAuditStatusTool } from "@/server/mcp/tools/site-audit-tools";
import {
  backoffDelayMs,
  type PollConfig,
} from "@/server/features/sam/samTurnControls";
import type { ToolExecutionTracker } from "@/server/features/sam/samToolExecution";

// Long-running tool orchestration for SAM (Phase P). Site audits are async
// workflows: run_site_audit starts one and returns immediately, so an agent
// that needs the final result must wait for a terminal state before answering.
//
// This module gives the agent one first-class way to wait — poll_site_audit —
// instead of hoping the model improvises a get_audit_status loop. The poller:
//   - reads status through the SAME MCP handler the MCP server registers
//     (identical D1 state, project scoping, and the dead-workflow self-heal),
//   - normalizes every read into one async-state shape (P2),
//   - polls on exponential backoff until completed / failed / cancelled or
//     the attempt/wall-clock budget is spent (P3, P4),
//   - single-flights concurrent waits for the same audit and memoizes
//     terminal results per audit (P7),
//   - counts as ONE tool call toward AI_AGENT_MAX_TOOL_CALLS; its internal
//     status reads are logged but never billed or budgeted as paid calls (P8).
// Provider-agnostic by construction: it is plain tool orchestration around
// OpenSEO state, with no model/provider-specific logic (P12).

// ─── Normalized async-tool state (P2) ────────────────────────────────────────

export type AsyncToolStateName =
  | "started"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AsyncToolProgress = { current: number; total: number };

export type AsyncToolState = {
  state: AsyncToolStateName;
  progress?: AsyncToolProgress;
  /** True only when the workflow reached `completed` — final data is readable. */
  resultReady: boolean;
  error?: string;
};

/** What one poll_site_audit call returns to the model. */
export type AuditPollResult = AsyncToolState & {
  tool: "poll_site_audit";
  auditId: string | null;
  /** Status reads performed this call (1 = terminal/failed on first read). */
  attempts: number;
  durationMs: number;
  /** True when still running and the attempt/time budget ran out. */
  timedOut: boolean;
};

/** Shape of AuditService.getStatus rows surfaced through get_audit_status. */
type RawAuditStatus = {
  id: string;
  status: string;
  pagesCrawled: number;
  pagesTotal: number;
};

/**
 * Map the audit row's canonical DB states ("running" | "completed" | "failed")
 * onto the normalized async-state vocabulary. There is no distinct persisted
 * "cancelled" state: a cancelled/deleted audit either disappears (surfaces as
 * NOT_FOUND → mapped to `cancelled` at the call site) or its terminated
 * workflow self-heals to "failed".
 */
export function normalizeAuditStatus(raw: RawAuditStatus): AsyncToolState {
  const progress =
    raw.pagesTotal > 0 ? { current: raw.pagesCrawled, total: raw.pagesTotal } : undefined;
  switch (raw.status) {
    case "completed":
      return { state: "completed", progress, resultReady: true };
    case "failed":
      return {
        state: "failed",
        progress,
        resultReady: false,
        error: "The site audit failed.",
      };
    default:
      // "running" (any phase) and anything unrecognized: keep waiting.
      return { state: "running", progress, resultReady: false };
  }
}

// ─── Single-flight + terminal memo (P7) ──────────────────────────────────────

const TERMINAL_MEMO_CAP = 16;

export function createPollCoordinator() {
  // One shared promise per in-flight wait, keyed by project:auditId-or-latest,
  // so concurrent paths in the same conversation reuse one poll loop instead
  // of stacking duplicate readers on the same audit.
  const inflight = new Map<string, Promise<AuditPollResult>>();
  // Terminal states are immutable — memoize them per explicit audit id so a
  // follow-up question about the same audit doesn't re-poll. Only explicit
  // ids are memoized ("latest" must always re-resolve: a newer audit may exist).
  const terminalMemo = new Map<string, AuditPollResult>();

  return {
    async poll(
      key: string,
      explicitAuditId: string | null,
      execute: () => Promise<AuditPollResult>,
    ): Promise<AuditPollResult> {
      if (explicitAuditId) {
        const done = terminalMemo.get(explicitAuditId);
        if (done) return done;
      }
      const existing = inflight.get(key);
      if (existing) return existing;

      const promise = execute().finally(() => inflight.delete(key));
      inflight.set(key, promise);
      const result = await promise;
      if (explicitAuditId && result.state !== "running") {
        if (terminalMemo.size >= TERMINAL_MEMO_CAP) {
          const oldest = terminalMemo.keys().next().value;
          if (oldest !== undefined) terminalMemo.delete(oldest);
        }
        terminalMemo.set(explicitAuditId, result);
      }
      return result;
    },
  };
}

export type PollCoordinator = ReturnType<typeof createPollCoordinator>;

// ─── The poll_site_audit tool (P3, P4) ───────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read status through the shared MCP handler (never raw repositories). */
async function readStatusViaMcp(
  auditId: string | undefined,
  projectId: string,
  extra: ToolExtra,
): Promise<CallToolResult> {
  return withPgClient(() =>
    getAuditStatusTool.handler(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- handler re-validates these args against its own zod schema
      { projectId, ...(auditId ? { auditId } : {}) } as Parameters<
        typeof getAuditStatusTool.handler
      >[0],
      extra,
    ),
  );
}

export type PollSiteAuditInput = {
  projectId: string;
  extra: ToolExtra;
  tracker: ToolExecutionTracker;
  sessionId: string;
  coordinator: PollCoordinator;
  config: PollConfig;
};

/**
 * Build SAM's `poll_site_audit` tool. The description doubles as the model's
 * contract: it explains the returned states and what to do for each, which is
 * what makes START-vs-FINAL-RESULT behavior (P5) enforceable without any
 * provider-specific logic.
 */
export function buildPollSiteAuditTool(input: PollSiteAuditInput) {
  const { projectId, tracker, sessionId, coordinator } = input;

  return tool({
    description:
      "Wait for a site audit to reach a terminal state before answering questions that need its results. " +
      "Call after run_site_audit whenever the user asked for audit findings (page counts, issues), not merely to start one. " +
      "Returns state: completed (resultReady — now call get_audit_issues/get_audit_pages), failed, cancelled, or running with timedOut=true. " +
      "If timedOut, tell the user the audit is still running; never invent results. Free — reads OpenSEO state.",
    inputSchema: z.object({
      auditId: z
        .string()
        .optional()
        .describe("Audit to wait for. Omit for the project's most recent audit."),
    }),
    execute: async ({ auditId }) => {
      const startedAt = Date.now();
      // Single-flight key: explicit id when given, else the latest-audit slot.
      const key = `${projectId}:${auditId ?? "latest"}`;
      const outcome = await coordinator.poll(key, auditId ?? null, () =>
        pollUntilTerminal(auditId, input, startedAt),
      );
      tracker.log({
        sessionId,
        projectId,
        toolName: "poll_site_audit",
        reused: outcome.attempts === 0,
        status:
          outcome.state === "failed" || outcome.state === "cancelled"
            ? "error"
            : "ok",
        durationMs: Date.now() - startedAt,
      });
      return outcome;
    },
  });
}

async function pollUntilTerminal(
  auditId: string | undefined,
  input: PollSiteAuditInput,
  startedAt: number,
): Promise<AuditPollResult> {
  const { projectId, extra, tracker, sessionId, config } = input;
  let attempts = 0;
  let consecutiveReadErrors = 0;

  while (true) {
    const elapsed = Date.now() - startedAt;
    if (attempts >= config.maxAttempts || elapsed >= config.timeoutMs) {
      return {
        tool: "poll_site_audit",
        auditId: auditId ?? null,
        state: "running",
        resultReady: false,
        timedOut: true,
        attempts,
        durationMs: elapsed,
      };
    }
    // Backoff BEFORE each read except the immediate first one (catches
    // instant failures fast), clamped so we never sleep past the deadline.
    if (attempts > 0) {
      const remaining = config.timeoutMs - (Date.now() - startedAt);
      const delay = Math.min(backoffDelayMs(attempts, config.initialMs, config.maxMs), remaining);
      if (delay > 0) await sleep(delay);
    }
    attempts++;

    let raw: RawAuditStatus;
    try {
      const result = await readStatusViaMcp(auditId, projectId, extra);
      const statusPart = (
        result.structuredContent as { status?: RawAuditStatus } | undefined
      )?.status;
      if (!statusPart) throw new Error("get_audit_status returned no status.");
      raw = statusPart;
      consecutiveReadErrors = 0;
    } catch (error) {
      // A missing audit means it was deleted/cancelled mid-wait — terminal.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found") || message.includes("No audits")) {
        tracker.log({
          sessionId,
          projectId,
          toolName: "get_audit_status",
          reused: false,
          status: "error",
          durationMs: 0,
        });
        return {
          tool: "poll_site_audit",
          auditId: auditId ?? null,
          state: "cancelled",
          resultReady: false,
          error: "The audit was deleted or cancelled while waiting.",
          attempts,
          durationMs: Date.now() - startedAt,
          timedOut: false,
        };
      }
      consecutiveReadErrors++;
      if (consecutiveReadErrors >= 3) {
        tracker.log({
          sessionId,
          projectId,
          toolName: "get_audit_status",
          reused: false,
          status: "error",
          durationMs: 0,
        });
        return {
          tool: "poll_site_audit",
          auditId: auditId ?? null,
          state: "failed",
          resultReady: false,
          error: `Could not read audit status: ${message}`,
          attempts,
          durationMs: Date.now() - startedAt,
          timedOut: false,
        };
      }
      continue;
    }

    // Observability stays intact: every internal read is logged like the
    // equivalent manual get_audit_status call would be (P6).
    tracker.log({
      sessionId,
      projectId,
      toolName: "get_audit_status",
      reused: false,
      status: "ok",
      durationMs: 0,
    });

    const state = normalizeAuditStatus(raw);
    if (state.state !== "running") {
      return {
        tool: "poll_site_audit",
        auditId: raw.id,
        ...state,
        attempts,
        durationMs: Date.now() - startedAt,
        timedOut: false,
      };
    }
  }
}

// ─── run_site_audit output normalization (P2 "started") ──────────────────────

/**
 * Post-processor for SAM's adapted run_site_audit: tags a successful start
 * with the canonical `started` state so the model sees one consistent
 * vocabulary across the whole audit lifecycle.
 */
export function tagStartedAudit(output: unknown): unknown {
  if (!isRecord(output) || !isRecord(output.data)) return output;
  if (typeof output.data.auditId !== "string") return output;
  return {
    ...output,
    data: {
      ...output.data,
      state: "started" satisfies AsyncToolStateName,
      resultReady: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
