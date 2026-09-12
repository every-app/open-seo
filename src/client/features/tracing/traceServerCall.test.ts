import { beforeEach, describe, expect, it, vi } from "vitest";
import { globalTraceStore } from "./globalTraceStore";
import { traceServerCall } from "./traceServerCall";

describe("traceServerCall", () => {
  beforeEach(() => {
    globalTraceStore.clearTrace();
    globalTraceStore.setDiagnosticsEnabled(true);
    globalTraceStore.setActiveFilter("all");
  });

  it("invokes the wrapped call once and records a successful operation", async () => {
    const call = vi.fn(async () => ({ ok: true as const }));

    const result = await traceServerCall({
      feature: "settings",
      operation: "settings.dataforseo.settings_save",
      source: "Settings",
      projectId: "project_1",
      metadata: { scope: "organization", changedFields: ["enabled"] },
      call,
      mapSuccess: () => ({
        status: "success",
        billing: "Free",
        metered: false,
        cache: "Not applicable",
        counters: { settingsSaved: 1 },
      }),
    });

    expect(result).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(1);
    const operations = globalTraceStore.getState().operations;
    expect(operations).toHaveLength(1);
    expect(operations[0]?.operation).toBe("settings.dataforseo.settings_save");
    expect(operations[0]?.status).toBe("success");
    expect(operations[0]?.projectId).toBe("project_1");
    expect(operations[0]?.counters).toEqual({ settingsSaved: 1 });
  });

  it("records a sanitized failure and rethrows the original error", async () => {
    const failure = Object.assign(new Error("Connection failed: password=hunter2"), {
      code: "CONNECTION_FAILED",
    });
    const call = vi.fn(async (): Promise<never> => {
      throw failure;
    });

    await expect(
      traceServerCall({
        feature: "settings",
        operation: "settings.dataforseo.connection_test",
        source: "Settings",
        call,
      }),
    ).rejects.toBe(failure);

    const operation = globalTraceStore.getState().operations[0];
    expect(operation?.status).toBe("failed");
    expect(operation?.errorClass).toBe("CONNECTION_FAILED");
    expect(operation?.errorMessage).not.toContain("hunter2");
    expect(operation?.errorMessage).toContain("[redacted]");
  });

  it("does not record operations while diagnostics are disabled", async () => {
    globalTraceStore.setDiagnosticsEnabled(false);
    const call = vi.fn(async () => "ok");

    await expect(
      traceServerCall({
        feature: "settings",
        operation: "settings.project.update",
        source: "Project settings",
        call,
      }),
    ).resolves.toBe("ok");

    expect(call).toHaveBeenCalledTimes(1);
    expect(globalTraceStore.getState().operations).toHaveLength(0);
  });
});
