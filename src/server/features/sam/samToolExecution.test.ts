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
});