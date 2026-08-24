import { describe, expect, it, vi } from "vitest";
import { createToolDedupCache, createToolExecutionTracker } from "./samToolExecution";

describe("createToolDedupCache", () => {
  it("returns the same value for identical tool+args keys", () => {
    const cache = createToolDedupCache();
    cache.set("tool_a:{a:1}", { summary: "first" });
    expect(cache.get("tool_a:{a:1}")).toEqual({ summary: "first" });
    expect(cache.get("tool_a:{a:2}")).toBeUndefined();
  });

  it("evicts the oldest entry once the cap is reached", () => {
    const cache = createToolDedupCache(2);
    cache.set("k1", 1);
    cache.set("k2", 2);
    cache.set("k3", 3);
    expect(cache.get("k1")).toBeUndefined();
    expect(cache.get("k2")).toBe(2);
    expect(cache.get("k3")).toBe(3);
  });
});

describe("createToolExecutionTracker", () => {
  it("caches successful outputs and logs events", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tracker = createToolExecutionTracker({
      sessionId: "session_1",
      projectId: "project_1",
    });

    const args = { query: "seo" };
    expect(tracker.getCached("research_keywords", args)).toBeUndefined();
    tracker.setCached("research_keywords", args, { summary: "data" });
    expect(tracker.getCached("research_keywords", args)).toEqual({
      summary: "data",
    });
    // Different args never collide with the cached entry.
    expect(tracker.getCached("research_keywords", { query: "other" })).toBeUndefined();

    tracker.log({
      sessionId: "session_1",
      projectId: "project_1",
      toolName: "research_keywords",
      reused: false,
      status: "ok",
      durationMs: 42,
    });
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        type: "sam-tool",
        sessionId: "session_1",
        projectId: "project_1",
        tool: "research_keywords",
        reused: false,
        status: "ok",
        durationMs: 42,
      }),
    );
    logSpy.mockRestore();
  });

  it("logs a reused cache hit with reused:true (Phase R contract)", () => {
    const events: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        events.push(args.map(String).join(" "));
      });
    const tracker = createToolExecutionTracker({
      sessionId: "s",
      projectId: "p",
    });
    tracker.log({
      sessionId: "s",
      projectId: "p",
      toolName: "get_audit_status",
      reused: true,
      status: "ok",
      durationMs: 0,
    });
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- tracker emits one self-owned JSON line
    const event: Record<string, unknown> = JSON.parse(events[0]);
    expect(event).toMatchObject({
      type: "sam-tool",
      tool: "get_audit_status",
      reused: true,
      status: "ok",
    });
    logSpy.mockRestore();
  });

  it("logs failures with status:error and never includes payloads or secrets", () => {
    const events: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        events.push(args.map(String).join(" "));
      });
    const tracker = createToolExecutionTracker({
      sessionId: "s",
      projectId: "p",
    });
    tracker.log({
      sessionId: "s",
      projectId: "p",
      toolName: "get_domain_overview",
      reused: false,
      status: "error",
      durationMs: 358,
    });
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- tracker emits one self-owned JSON line
    const event: Record<string, unknown> = JSON.parse(events[0]);
    expect(event).toMatchObject({
      type: "sam-tool",
      tool: "get_domain_overview",
      reused: false,
      status: "error",
      durationMs: 358,
    });
    // Event schema carries only tool name/status/duration + ids — no args,
    // no outputs, nothing secret-bearing can ride along.
    expect(Object.keys(event).toSorted()).toEqual([
      "durationMs",
      "projectId",
      "reused",
      "sessionId",
      "status",
      "tool",
      "type",
    ]);
    logSpy.mockRestore();
  });
});