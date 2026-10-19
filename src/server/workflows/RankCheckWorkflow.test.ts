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
  runQueuedCheck: vi.fn(),
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
  SINGLE_ATTEMPT_STEP_CONFIG: {
    retries: { limit: 0, delay: "1 second" },
    timeout: "2 minutes",
  },
}));
vi.mock("@/server/workflows/rankCheckQueuedPath", () => ({
  runQueuedCheck: mocks.runQueuedCheck,
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
  devices: "desktop" as "desktop" | "mobile" | "both",
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
  overrides: Partial<typeof payload> & {
    maxCostCredits?: number;
    validateSerps?: boolean;
  },
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
    mocks.runLiveCheck.mockResolvedValue([]);
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
    mocks.runLiveCheck.mockResolvedValue([]);
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

  // Two pairs have no snapshot because the run held them, so the message
  // carries the partial count and why those readings were held.
  it("records held readings on a completed validated run", async () => {
    mocks.getRunById.mockResolvedValue({ ...activeRun, keywordsTotal: 3 });
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_0", device: "mobile" },
      { trackingKeywordId: "kw_1", device: "desktop" },
      { trackingKeywordId: "kw_1", device: "mobile" },
      { trackingKeywordId: "kw_2", device: "desktop" },
    ]);
    mocks.runQueuedCheck.mockResolvedValue({
      queueTasks: 6,
      queueCollected: 4,
      fallbackTasks: 0,
      fallbackChecked: 0,
      validated: 4,
      locationDropped: 4,
      historySuspect: 2,
      reposted: 3,
      withheld: 1,
      undelivered: 1,
      htmlUnavailable: 0,
    });

    await runWorkflow({ devices: "both", validateSerps: true });

    expect(mocks.runLiveCheck).not.toHaveBeenCalled();
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "completed",
        errorMessage:
          "Checked 2 of 3 desktop and 2 of 3 mobile keyword(s) Held 2 reading(s) at their previous position: 1 judged a bad page on every crawl, 1 not delivered or not checkable by the queue in time.",
      }),
    );
    expect(mocks.updateConfig).toHaveBeenCalled();
  });

  it("reports a run that missed a whole device as partial", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue(
      keywords(3).map((kw) => ({
        trackingKeywordId: kw.id,
        device: "desktop",
      })),
    );

    await runWorkflow({ devices: "both" });

    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "completed",
        keywordsChecked: 3,
        errorMessage:
          "Checked 3 of 3 desktop and 0 of 3 mobile keyword(s): Invalid Field: 'location_name'.",
      }),
    );
  });
});

describe("manual run queue fallback", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({ isActive: true });
    mocks.runQueuedCheck.mockResolvedValue(null);
    mocks.getRunById.mockResolvedValue(activeRun);
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(2));
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({ balance: { remaining: 1_000 } });
  });

  // The options are the contract: a second live call could pass the credits
  // the user approved, and a queued not-found must not overwrite a position.
  it("queues only the pairs the live endpoint missed, without a live fallback", async () => {
    const missed = [
      { keyword: "keyword 1", keywordId: "kw_1", device: "desktop" },
    ];
    mocks.runLiveCheck.mockResolvedValue(missed);

    await runWorkflow({});

    expect(mocks.runQueuedCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runId: "run_1" }),
      { taskInputs: missed, liveFallback: false, saveNotFound: false },
    );
  });

  it("skips the queue when the live endpoint checked every pair", async () => {
    mocks.runLiveCheck.mockResolvedValue([]);

    await runWorkflow({});

    expect(mocks.runQueuedCheck).not.toHaveBeenCalled();
  });
});
