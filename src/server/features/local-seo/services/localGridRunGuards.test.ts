import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkflow: vi.fn(),
  failStalePendingRun: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { LOCAL_GRID_WORKFLOW: { get: mocks.getWorkflow } },
}));
vi.mock("../repositories/LocalGridRunGuardRepository", () => ({
  LocalGridRunGuardRepository: {
    failStalePendingRun: mocks.failStalePendingRun,
  },
}));

import { reconcilePendingLocalGridRun } from "./localGridRunGuards";

function pendingRun(ageMs: number) {
  return {
    id: "run-1",
    status: "pending",
    startedAt: new Date(Date.now() - ageMs).toISOString(),
  };
}

describe("reconcilePendingLocalGridRun", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a fresh pending run inside the startup grace window", async () => {
    mocks.getWorkflow.mockRejectedValue(new Error("not found"));

    await expect(reconcilePendingLocalGridRun(pendingRun(1_000))).resolves.toBe(
      "active",
    );
    expect(mocks.failStalePendingRun).not.toHaveBeenCalled();
  });

  it("keeps an old pending run when its workflow is queued", async () => {
    mocks.getWorkflow.mockResolvedValue({
      status: vi.fn().mockResolvedValue({ status: "queued" }),
    });

    await expect(
      reconcilePendingLocalGridRun(pendingRun(5 * 60 * 1_000)),
    ).resolves.toBe("active");
    expect(mocks.failStalePendingRun).not.toHaveBeenCalled();
  });

  it("conditionally recovers an orphaned pending run", async () => {
    const run = pendingRun(5 * 60 * 1_000);
    mocks.getWorkflow.mockRejectedValue(new Error("not found"));
    mocks.failStalePendingRun.mockResolvedValue(true);

    await expect(reconcilePendingLocalGridRun(run)).resolves.toBe("recovered");
    expect(mocks.failStalePendingRun).toHaveBeenCalledWith({
      runId: run.id,
      startedAt: run.startedAt,
      reason: "Workflow instance was not found",
    });
  });

  it("reports when another reconciler wins the compare-and-set", async () => {
    mocks.getWorkflow.mockRejectedValue(new Error("not found"));
    mocks.failStalePendingRun.mockResolvedValue(false);

    await expect(
      reconcilePendingLocalGridRun(pendingRun(5 * 60 * 1_000)),
    ).resolves.toBe("lost_race");
  });
});
