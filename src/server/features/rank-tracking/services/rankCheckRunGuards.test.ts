import { describe, expect, it, vi } from "vitest";
import { beginRankCheckRun } from "./rankCheckRunGuards";

const mocks = vi.hoisted(() => ({
  tryCreateRun: vi.fn(),
  getActiveRunForConfig: vi.fn(),
  getRunById: vi.fn(),
  updateRun: vi.fn(),
  getWorkflow: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    RANK_CHECK_WORKFLOW: { get: mocks.getWorkflow },
  },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);

const input = {
  config: {
    id: "config_1",
    domain: "example.com",
    locationCode: 2840,
    languageCode: "en",
    locationName: null,
    devices: "desktop" as const,
    serpDepth: 20,
  },
  projectId: "project_1",
  billingCustomer: {
    userId: "user_1",
    userEmail: "user@example.com",
    organizationId: "org_1",
    projectId: "project_1",
  },
  keywordsTotal: 2,
  trigger: "manual" as const,
  workflowStartErrorMessage: "failed",
};

describe("beginRankCheckRun", () => {
  // The workflow enforces the ceiling, so forwarding it (or its absence) is the
  // billing contract.
  it.each([undefined, 12])(
    "starts one workflow with the approved credit ceiling %s",
    async (maxCostCredits) => {
      mocks.tryCreateRun.mockResolvedValue(true);
      const create = vi
        .fn<(input: { params: { maxCostCredits?: number } }) => Promise<void>>()
        .mockResolvedValue(undefined);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only create is exercised by this unit test
      const workflow = { create } as unknown as Env["RANK_CHECK_WORKFLOW"];

      const result = await beginRankCheckRun({
        ...input,
        workflow,
        maxCostCredits,
      });

      if (!result.ok) throw new Error("expected the run to start");
      expect(result.runId).toEqual(expect.any(String));
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0]?.[0].params.maxCostCredits).toBe(
        maxCostCredits,
      );
    },
  );

  it("does not create another workflow when a run is already active", async () => {
    const blocker = {
      id: "run_0",
      status: "running" as const,
      startedAt: new Date().toISOString(),
    };
    mocks.tryCreateRun.mockResolvedValue(false);
    mocks.getActiveRunForConfig.mockResolvedValue(blocker);
    mocks.getWorkflow.mockResolvedValue({
      status: vi.fn().mockResolvedValue({ status: "running" }),
    });
    const create = vi.fn();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- no workflow methods should run on the blocked path
    const workflow = { create } as unknown as Env["RANK_CHECK_WORKFLOW"];

    await expect(beginRankCheckRun({ ...input, workflow })).resolves.toEqual({
      ok: false,
      reason: "already_running",
      blockingRunId: "run_0",
    });
    expect(create).not.toHaveBeenCalled();
    expect(mocks.tryCreateRun).toHaveBeenCalledTimes(1);
  });

  it("terminates a run still active after 12 hours and starts the new one", async () => {
    const blocker = {
      id: "run_0",
      status: "running" as const,
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    mocks.tryCreateRun.mockResolvedValueOnce(false).mockResolvedValue(true);
    mocks.getActiveRunForConfig.mockResolvedValue(blocker);
    const terminate = vi.fn();
    mocks.getWorkflow.mockResolvedValue({
      status: vi.fn().mockResolvedValue({ status: "running" }),
      terminate,
    });
    const create = vi.fn();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only create and get are exercised by this unit test
    const workflow = {
      create,
      get: mocks.getWorkflow,
    } as unknown as Env["RANK_CHECK_WORKFLOW"];

    const result = await beginRankCheckRun({ ...input, workflow });

    expect(result.ok).toBe(true);
    expect(terminate).toHaveBeenCalled();
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_0",
      expect.objectContaining({ status: "failed" }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
