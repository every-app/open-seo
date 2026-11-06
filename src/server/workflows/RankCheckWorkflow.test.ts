import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import { AUTUMN_SEO_DATA_BALANCE_FEATURE_ID } from "@/shared/billing";
import { RankCheckWorkflow } from "./RankCheckWorkflow";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getRunById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  updateRun: vi.fn(),
  updateConfig: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  updateSnapshotUrls: vi.fn(),
  resolveGotoUrls: vi.fn(),
  autumnCheck: vi.fn(),
  createDataforseoClient: vi.fn(),
  runQueuedCheck: vi.fn(),
  failRunIfActive: vi.fn(),
  captureServerEvent: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  sendCreditsExhaustedEvent: vi.fn(),
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
  runQueuedCheck: mocks.runQueuedCheck,
}));
vi.mock("@/server/workflows/rankCheckRetries", () => ({
  READ_WINDOW_MS: 0,
  retryRankChecks: vi.fn(),
}));
vi.mock("@/server/workflows/pgStep", () => ({
  // Like the engine, run() gets a rebuilt Error, never the thrown object.
  pgStep: async (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => {
    try {
      return await fn();
    } catch (error) {
      throw new Error(
        error instanceof Error ? `${error.name}: ${error.message}` : "",
        { cause: error },
      );
    }
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  MAX_GOTO_URLS_PER_REQUEST: 2,
  resolveGotoUrls: mocks.resolveGotoUrls,
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
vi.mock("@/server/email/onboarding-drip", () => ({
  sendCreditsExhaustedEvent: mocks.sendCreditsExhaustedEvent,
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
    mocks.updateRun.mockResolvedValue(true);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({
      allowed: true,
      balance: { remaining: 1_000 },
    });
  });

  it("rejects a keyword-list race before balance or DataForSEO calls", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(4));

    await expect(runWorkflow({ maxCostCredits: 18 })).rejects.toThrow();

    expect(mocks.autumnCheck).not.toHaveBeenCalled();
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
    expect(mocks.runQueuedCheck).not.toHaveBeenCalled();
  });

  it("keeps a credits refusal as the bare code, so the credits card shows", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(5));
    mocks.autumnCheck.mockResolvedValue({ balance: { remaining: 0 } });

    await expect(runWorkflow({})).rejects.toThrow("INSUFFICIENT_CREDITS");

    expect(mocks.failRunIfActive).toHaveBeenCalledWith(
      "run_1",
      "INSUFFICIENT_CREDITS",
    );
    expect(mocks.updateConfig).toHaveBeenCalledWith("config_1", "project_1", {
      lastSkipReason: "insufficient_credits",
    });
    expect(mocks.sendCreditsExhaustedEvent).toHaveBeenCalled();
  });

  it("refuses without the credits email when the auto-reload budget holds back top-up credits", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(5));
    mocks.autumnCheck.mockImplementation(
      async ({ featureId }: { featureId: string }) =>
        featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
          ? { allowed: false, balance: { remaining: 0 } }
          : { allowed: false, balance: { remaining: 12_000 } },
    );

    await expect(runWorkflow({})).rejects.toThrow("INSUFFICIENT_CREDITS");

    expect(mocks.failRunIfActive).toHaveBeenCalledWith(
      "run_1",
      "INSUFFICIENT_CREDITS",
    );
    expect(mocks.sendCreditsExhaustedEvent).not.toHaveBeenCalled();
  });

  it("does not refuse as out of credits when an Autumn read fails open", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(5));
    // The SDK's response to a timed-out check.
    mocks.autumnCheck.mockResolvedValue({ allowed: true, balance: null });

    await expect(runWorkflow({})).rejects.toThrow("no usage_credits balance");

    expect(mocks.failRunIfActive).not.toHaveBeenCalledWith(
      "run_1",
      "INSUFFICIENT_CREDITS",
    );
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  // Exactly at the ceiling is approved (the guard is strictly greater), and
  // callers without a ceiling — every scheduled check — must not be treated
  // as approving zero credits.
  it.each([
    ["at the approved ceiling", 18, 3],
    ["without a ceiling", undefined, 5],
  ])("checks the reloaded list %s", async (_label, maxCostCredits, count) => {
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(count));

    await runWorkflow({ maxCostCredits });

    expect(mocks.updateRun).toHaveBeenCalledWith("run_1", {
      keywordsTotal: count,
    });
    expect(mocks.runQueuedCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ keywords: keywords(count) }),
    );
  });
});

describe("rank check finalization", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({ isActive: true });
    mocks.getRunById.mockResolvedValue({ ...activeRun, keywordsTotal: 3 });
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(3));
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    mocks.updateRun.mockResolvedValue(true);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({
      allowed: true,
      balance: { remaining: 1_000 },
    });
  });

  it("fails a run where no keyword produced a snapshot", async () => {
    await runWorkflow({});

    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "failed",
        errorMessage: "No keywords could be checked.",
      }),
    );
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it("keeps the failure when stale cleanup fails the run before it finalizes", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue(
      keywords(3).map((kw) => ({
        trackingKeywordId: kw.id,
        device: "desktop",
      })),
    );
    // The run is active until the finalize write, which finds it failed.
    mocks.updateRun.mockImplementation(
      async (_id: string, data: { status?: string }) =>
        data.status !== "completed",
    );

    await runWorkflow({});

    expect(mocks.updateConfig).not.toHaveBeenCalled();
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
          'Checked 3 of 3 desktop and 0 of 3 mobile keyword(s). Not checked: "keyword 0" (mobile), "keyword 1" (mobile), "keyword 2" (mobile).',
      }),
    );
  });

  it("names the keywords a partial run could not check", async () => {
    mocks.getRunById.mockResolvedValue({ ...activeRun, keywordsTotal: 12 });
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(12));
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_0", device: "desktop" },
    ]);

    await runWorkflow({});

    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "completed",
        errorMessage: `Checked 1 of 12 keyword(s). Not checked: "keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5", "keyword 6", "keyword 7", "keyword 8", "keyword 9", "keyword 10" and 1 more.`,
      }),
    );
  });
});

const gotoUrl = (id: number) => `https://google.com/goto?url=${id}`;

describe("rank check goto URLs", () => {
  const gotoSnapshot = (id: number) => ({
    id,
    trackingKeywordId: `kw_${id}`,
    device: "desktop",
    url: gotoUrl(id),
  });

  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({ isActive: true });
    mocks.getRunById.mockResolvedValue({ ...activeRun, keywordsTotal: 1 });
    mocks.getKeywordsForConfig.mockResolvedValue(keywords(1));
    mocks.updateRun.mockResolvedValue(true);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({
      allowed: true,
      balance: { remaining: 1_000 },
    });
    mocks.resolveGotoUrls.mockResolvedValue(new Map());
  });

  it("saves the real page for a goto result, without Google's srsltid", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      gotoSnapshot(1),
      { ...gotoSnapshot(2), url: "https://example.com/direct" },
      { ...gotoSnapshot(3), position: null, url: null },
    ]);
    mocks.resolveGotoUrls.mockResolvedValue(
      new Map([[gotoUrl(1), "https://example.com/page?id=1&srsltid=abc"]]),
    );

    await runWorkflow({});

    expect(mocks.resolveGotoUrls).toHaveBeenCalledExactlyOnceWith([gotoUrl(1)]);
    expect(mocks.updateSnapshotUrls).toHaveBeenCalledExactlyOnceWith([
      { id: 1, url: "https://example.com/page?id=1" },
    ]);
  });

  it("keeps a goto link the converter can't resolve", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([gotoSnapshot(1)]);

    await runWorkflow({});

    expect(mocks.updateSnapshotUrls).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("splits a large run across converter requests", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue(
      [1, 2, 3].map((id) => gotoSnapshot(id)),
    );

    await runWorkflow({});

    expect(mocks.resolveGotoUrls.mock.calls).toEqual([
      [[gotoUrl(1), gotoUrl(2)]],
      [[gotoUrl(3)]],
    ]);
  });

  it("still finishes the run when the converter fails", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([gotoSnapshot(1)]);
    mocks.resolveGotoUrls.mockRejectedValue(new Error("converter down"));

    await runWorkflow({});

    expect(mocks.updateSnapshotUrls).not.toHaveBeenCalled();
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({ status: "completed", errorMessage: null }),
    );
  });
});
