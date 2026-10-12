import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import { RankCheckWorkflow } from "./RankCheckWorkflow";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getRunById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  updateRun: vi.fn(),
  updateConfig: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  autumnCheck: vi.fn(),
  createDataforseoClient: vi.fn(),
  runLiveCheck: vi.fn(),
  failRunIfActive: vi.fn(),
  captureServerEvent: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: vi.fn(),
}));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/db", () => ({ withPgClient: (fn: () => unknown) => fn() }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  failRunIfActive: mocks.failRunIfActive,
}));
vi.mock("@/server/workflows/rankCheckPaths", () => ({
  runLiveCheck: mocks.runLiveCheck,
  runQueuedCheck: vi.fn(),
}));
vi.mock("@/server/workflows/pgStep", () => ({
  pgStep: (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => fn(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: { check: mocks.autumnCheck },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

const activeRun = {
  id: "run_1",
  status: "running",
};

const payload = {
  runId: "run_1",
  configId: "config_1",
  billingCustomer,
  projectId: "project_1",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  devices: "desktop" as const,
  serpDepth: 10,
  trigger: "manual" as const,
};

function keywords(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `kw_${index}`,
    keyword: `keyword ${index}`,
  }));
}

function runWorkflow(
  overrides: Partial<typeof payload> & { maxCostCredits?: number },
) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked base class does not inspect Worker constructor context
  const workflow = new RankCheckWorkflow({} as ExecutionContext, {} as Env);
  return workflow.run(
    {
      instanceId: "run_1",
      timestamp: new Date(),
      payload: { ...payload, ...overrides },
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- workflow steps are executed directly by the pgStep mock
    {} as WorkflowStep,
  );
}

describe("rank check workflow credit ceiling", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({ isActive: true });
    mocks.getRunById.mockResolvedValue(activeRun);
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({ balance: { remaining: 1_000 } });
  });

  it("rejects a keyword-list race before balance or DataForSEO calls", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(5));

    await expect(runWorkflow({ maxCostCredits: 12 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(mocks.autumnCheck).not.toHaveBeenCalled();
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
    expect(mocks.runLiveCheck).not.toHaveBeenCalled();
  });

  // Exactly at the ceiling is approved (the guard is strictly greater), and
  // callers without a ceiling — every scheduled check — must not be treated
  // as approving zero credits.
  it.each([
    ["at the approved ceiling", 12, 4],
    ["without a ceiling", undefined, 5],
  ])("checks the reloaded list %s", async (_label, maxCostCredits, count) => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(count));

    await runWorkflow({ maxCostCredits });

    expect(mocks.updateRun).toHaveBeenCalledWith("run_1", {
      keywordsTotal: count,
    });
    expect(mocks.runLiveCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ keywords: keywords(count) }),
    );
  });
});

describe("rank check finalization", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({ isActive: true });
    mocks.getRunById.mockResolvedValue({
      ...activeRun,
      keywordsTotal: 3,
      // Recorded by the batch step on the first rejected keyword.
      errorMessage: "Invalid Field: 'location_name'.",
    });
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(3));
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({ balance: { remaining: 1_000 } });
  });

  it("fails a run where no keyword produced a snapshot, keeping the recorded reason", async () => {
    await runWorkflow({});

    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "failed",
        errorMessage: "Invalid Field: 'location_name'.",
      }),
    );
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
});
