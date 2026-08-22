import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createPollCoordinator,
  normalizeAuditStatus,
  tagStartedAudit,
  buildPollSiteAuditTool,
  type AuditPollResult,
} from "./samLongRunningTools";
import type { PollConfig } from "./samTurnControls";
import type { ToolExecutionTracker } from "./samToolExecution";

vi.mock("cloudflare:workers", () => ({ env: {} }));

// get_audit_status reads are stubbed at the shared MCP handler boundary: the
// poller must go through it (never raw repositories), so the mock sits exactly
// where the real integration point is.
const statusHandler =
  vi.fn<(...args: unknown[]) => Promise<CallToolResult>>();
vi.mock("@/server/mcp/tools/site-audit-tools", () => ({
  getAuditStatusTool: { handler: (...a: unknown[]) => statusHandler(...a) },
}));

vi.mock("@/db", () => ({
  withPgClient: (fn: <T>(p: Promise<T>) => Promise<T>) => fn(Promise.resolve()),
}));

const config: PollConfig = {
  initialMs: 1_000,
  maxMs: 8_000,
  maxAttempts: 6,
  timeoutMs: 60_000,
};

function statusRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "audit-1",
    status: "running",
    pagesCrawled: 0,
    pagesTotal: 50,
    ...overrides,
  };
}

/** Queue a sequence of status rows; the Nth handler call returns the Nth. */
function queueStatuses(rows: Array<Record<string, unknown> | Error>) {
  let call = 0;
  statusHandler.mockImplementation(() => {
    const row = rows[call++];
    if (row instanceof Error) return Promise.reject(row);
    return Promise.resolve({
      content: [{ type: "text", text: "status" }],
      structuredContent: { status: row },
    });
  });
}

const nullTracker: ToolExecutionTracker = {
  getCached: () => undefined,
  setCached: () => {},
  log: () => {},
};

function makeTool(overrides: Partial<PollConfig> = {}) {
  const events: string[] = [];
  const tracker: ToolExecutionTracker = {
    ...nullTracker,
    log: (event) => events.push(`${event.toolName}:${event.status}`),
  };
  const poll = buildPollSiteAuditTool({
    projectId: "p1",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ToolExtra is opaque to the poller; the mocked handler never touches it
    extra: { requestId: 0 } as never,
    tracker,
    sessionId: "s1",
    coordinator: createPollCoordinator(),
    config: { ...config, ...overrides },
  });
  // The AI SDK's execute union includes AsyncIterable for streaming tools;
  // this tool resolves to a single AuditPollResult object.
  const run = (args: { auditId?: string } = {}): Promise<AuditPollResult> =>
    Promise.resolve(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing the SDK's streaming union for a non-streaming tool
      (poll.execute as (input: unknown, opts: unknown) => Promise<AuditPollResult>)(
        args,
        { toolCallId: "t", messages: [] },
      ),
    );
  return { run, events };
}

async function settle<T>(
  execution: PromiseLike<T>,
  totalMs: number,
  stepMs = 250,
): Promise<T> {
  let settled = false;
  const tracked = Promise.resolve(execution).finally(() => {
    settled = true;
  });
  for (let elapsed = 0; elapsed <= totalMs; elapsed += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    if (settled) break;
  }
  if (!settled) throw new Error("poll promise never settled under fake timers");
  return tracked;
}

describe("normalizeAuditStatus", () => {
  it("maps the canonical DB states onto the async vocabulary", () => {
    expect(normalizeAuditStatus(statusRow({ status: "running" }))).toEqual({
      state: "running",
      progress: { current: 0, total: 50 },
      resultReady: false,
    });
    expect(normalizeAuditStatus(statusRow({ status: "completed", pagesCrawled: 50 }))).toEqual({
      state: "completed",
      progress: { current: 50, total: 50 },
      resultReady: true,
    });
    expect(
      normalizeAuditStatus(statusRow({ status: "failed", pagesCrawled: 12 })),
    ).toEqual({
      state: "failed",
      progress: { current: 12, total: 50 },
      resultReady: false,
      error: "The site audit failed.",
    });
  });

  it("treats unrecognized statuses as running and omits progress when total is 0", () => {
    expect(normalizeAuditStatus(statusRow({ status: "weird" })).state).toBe(
      "running",
    );
    const noTotal = normalizeAuditStatus(
      statusRow({ pagesTotal: 0, pagesCrawled: 0 }),
    );
    expect(noTotal.progress).toBeUndefined();
  });
});

describe("createPollCoordinator", () => {
  it("shares one in-flight poll per key", async () => {
    const coordinator = createPollCoordinator();
    let calls = 0;
    const execute = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 0));
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal fixture; the coordinator only forwards the result
      return { state: "completed" } as AuditPollResult;
    });
    const [a, b] = await Promise.all([
      coordinator.poll("p1:audit-1", "audit-1", execute),
      coordinator.poll("p1:audit-1", "audit-1", execute),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it("memoizes terminal results per explicit audit id but not for latest", async () => {
    const coordinator = createPollCoordinator();
    const execute = vi.fn(
      async (): Promise<AuditPollResult> => ({
        tool: "poll_site_audit",
        auditId: "audit-1",
        state: "completed",
        resultReady: true,
        attempts: 1,
        durationMs: 1,
        timedOut: false,
      }),
    );
    await coordinator.poll("p1:audit-1", "audit-1", execute);
    await coordinator.poll("p1:audit-1", "audit-1", execute);
    expect(execute).toHaveBeenCalledTimes(1);

    await coordinator.poll("p1:latest", null, execute);
    await coordinator.poll("p1:latest", null, execute);
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("poll_site_audit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    statusHandler.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls running → running → completed and reports the terminal state", async () => {
    queueStatuses([
      statusRow({ pagesCrawled: 0 }),
      statusRow({ pagesCrawled: 12 }),
      statusRow({ status: "completed", pagesCrawled: 50 }),
    ]);
    const { run, events } = makeTool();
    const result = await settle(run(), 10_000);

    expect(result.state).toBe("completed");
    expect(result.resultReady).toBe(true);
    expect(result.progress).toEqual({ current: 50, total: 50 });
    expect(result.timedOut).toBe(false);
    expect(result.attempts).toBe(3);
    expect(statusHandler).toHaveBeenCalledTimes(3);
    // Every internal read stays observable (P6), plus one poll summary.
    expect(events.filter((e) => e.startsWith("get_audit_status"))).toHaveLength(
      3,
    );
    expect(events).toContain("poll_site_audit:ok");
  });

  it("returns a graceful failed outcome when the audit fails", async () => {
    queueStatuses([
      statusRow({}),
      statusRow({ status: "failed", pagesCrawled: 7 }),
    ]);
    const { run } = makeTool();
    const result = await settle(run(), 10_000);
    expect(result.state).toBe("failed");
    expect(result.resultReady).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("maps a mid-wait NOT_FOUND (deleted/cancelled audit) to cancelled", async () => {
    queueStatuses([
      statusRow({}),
      new Error("Audit audit-1 not found in this project."),
    ]);
    const { run } = makeTool();
    const result = await settle(run(), 10_000);
    expect(result.state).toBe("cancelled");
    expect(result.error).toMatch(/deleted or cancelled/);
  });

  it("stops at max attempts and never fabricates a result", async () => {
    queueStatuses(Array.from({ length: 10 }, () => statusRow({})));
    const { run } = makeTool({ maxAttempts: 3 });
    const result = await settle(run(), 60_000);
    expect(result.state).toBe("running");
    expect(result.timedOut).toBe(true);
    expect(result.resultReady).toBe(false);
    expect(result.attempts).toBe(3);
    expect(statusHandler).toHaveBeenCalledTimes(3);
  });

  it("stops at the wall-clock timeout even when attempts remain", async () => {
    queueStatuses(
      Array.from({ length: 20 }, (_, i) =>
        statusRow({ pagesCrawled: i * 5 }),
      ),
    );
    const { run } = makeTool({ timeoutMs: 5_000, maxAttempts: 50 });
    const result = await settle(run(), 30_000);
    expect(result.timedOut).toBe(true);
    expect(result.state).toBe("running");
    expect(result.attempts).toBeGreaterThanOrEqual(2);
    // Wall clock (fake) stopped at the window, not at the attempt budget.
    expect(result.durationMs).toBeLessThanOrEqual(6_000);
  });

  it("fails after three consecutive status-read errors", async () => {
    queueStatuses([
      new Error("d1 unavailable"),
      new Error("d1 unavailable"),
      new Error("d1 unavailable"),
    ]);
    const { run } = makeTool();
    const result = await settle(run(), 30_000);
    expect(result.state).toBe("failed");
    expect(result.error).toMatch(/Could not read audit status/);
  });

  it("passes an explicit auditId through to the status handler", async () => {
    queueStatuses([statusRow({ status: "completed", pagesCrawled: 50 })]);
    const { run } = makeTool();
    await settle(run({ auditId: "audit-9" }), 2_000);
    expect(statusHandler).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", auditId: "audit-9" }),
      expect.anything(),
    );
  });
});

describe("tagStartedAudit", () => {
  it("tags a successful run_site_audit output with state=started", () => {
    const output = {
      summary: "Audit a1 started.",
      data: { auditId: "a1" },
    };
    const tagged = tagStartedAudit(output) as {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- asserting the documented tagStartedAudit output shape
      data: { auditId: string; state: string; resultReady: boolean };
    };
    expect(tagged.data.state).toBe("started");
    expect(tagged.data.resultReady).toBe(false);
    expect(tagged.data.auditId).toBe("a1");
  });

  it("leaves outputs without an auditId untouched", () => {
    const output = { summary: "capacity reached" };
    expect(tagStartedAudit(output)).toBe(output);
  });
});
