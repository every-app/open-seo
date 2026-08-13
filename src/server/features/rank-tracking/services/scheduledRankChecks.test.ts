import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_KEYWORDS_PER_CONFIG } from "@/shared/rank-tracking";

type DueConfigRow = {
  id: string;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName: string | null;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  scheduleInterval: "daily" | "weekly" | "monthly" | "manual";
  nextCheckAt: string | null;
  organizationId: string;
};

type ClaimInput = {
  configId: string;
  projectId: string;
  observedNextCheckAt: string;
  nextCheckAt: string;
  lastSkipReason?: string | null;
};

type BeginResult =
  | { ok: true; runId: string }
  | { ok: false; reason: string; blockingRunId: string | null };

// Typed so assertions can read `mock.calls` without tripping the type-aware
// lint rules on `any`.
const mocks = vi.hoisted(() => ({
  getDueConfigsWithOrganization:
    vi.fn<(nowIso: string) => Promise<DueConfigRow[]>>(),
  getKeywordCountsForConfigs:
    vi.fn<(configIds: string[]) => Promise<Map<string, number>>>(),
  claimDueConfig: vi.fn<(input: ClaimInput) => Promise<boolean>>(),
  beginRankCheckRun:
    vi.fn<
      (input: {
        config: DueConfigRow;
        keywordsTotal: number;
        trigger: string;
      }) => Promise<BeginResult>
    >(),
  customerHasPaidPlan: vi.fn<(organizationId: string) => Promise<boolean>>(),
  isHostedServerAuthMode: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getDueConfigsWithOrganization: mocks.getDueConfigsWithOrganization,
      getKeywordCountsForConfigs: mocks.getKeywordCountsForConfigs,
      claimDueConfig: mocks.claimDueConfig,
    },
  }),
);
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  beginRankCheckRun: mocks.beginRankCheckRun,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double for the workflow binding
const testEnv = { RANK_CHECK_WORKFLOW: {} } as unknown as Env;

function dueConfig(overrides: Partial<DueConfigRow> = {}): DueConfigRow {
  return {
    id: "config_1",
    projectId: "project_1",
    domain: "acme.com",
    locationCode: 2840,
    languageCode: "en",
    locationName: null,
    devices: "both" as const,
    serpDepth: 20,
    scheduleInterval: "daily" as const,
    nextCheckAt: "2026-01-01T00:00:00.000Z",
    organizationId: "org_1",
    ...overrides,
  };
}

async function runTick() {
  const { runScheduledRankChecks } = await import("./scheduledRankChecks");
  await runScheduledRankChecks(testEnv);
}

describe("runScheduledRankChecks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(true);
    mocks.claimDueConfig.mockResolvedValue(true);
    mocks.beginRankCheckRun.mockResolvedValue({ ok: true, runId: "run_1" });
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([["config_1", 5]]),
    );
    mocks.getDueConfigsWithOrganization.mockResolvedValue([dueConfig()]);
  });

  it("advances a free config with plan_required instead of starting a workflow", async () => {
    mocks.customerHasPaidPlan.mockResolvedValue(false);

    await runTick();

    expect(mocks.claimDueConfig).toHaveBeenCalledTimes(1);
    expect(mocks.claimDueConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: "config_1",
        projectId: "project_1",
        observedNextCheckAt: "2026-01-01T00:00:00.000Z",
        lastSkipReason: "plan_required",
      }),
    );
    const [claim] = mocks.claimDueConfig.mock.calls[0];
    expect(new Date(claim.nextCheckAt).getTime()).toBeGreaterThan(Date.now());
    expect(mocks.beginRankCheckRun).not.toHaveBeenCalled();
  });

  it("advances a zero-keyword config with no_keywords without consuming budget", async () => {
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_empty" }),
      dueConfig({ id: "config_2", nextCheckAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([["config_2", 5]]),
    );

    await runTick();

    expect(mocks.claimDueConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: "config_empty",
        lastSkipReason: "no_keywords",
      }),
    );
    // The empty config consumed no budget, so the paid one behind it still ran.
    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    expect(mocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ keywordsTotal: 5, trigger: "scheduled" }),
    );
  });

  it("claims a paid config and starts its workflow", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTick();

    expect(mocks.claimDueConfig).toHaveBeenCalledTimes(1);
    expect(mocks.claimDueConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: "config_1",
        observedNextCheckAt: "2026-01-01T00:00:00.000Z",
        lastSkipReason: null,
      }),
    );
    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    // 5 keywords × both devices = 10 task units.
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "rank_tracking_scheduler_summary",
        candidates: 1,
        started: 1,
        unitsStarted: 10,
        stoppedByBudget: false,
        configErrors: 0,
      }),
    );
  });

  it("stops admitting configs once the task-unit budget is spent", async () => {
    // A legal-max config (MAX_KEYWORDS_PER_CONFIG × both devices) exceeds the
    // whole budget but is admitted as the tick's first start (oversized
    // exemption); the next config then hits the budget stop.
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_big" }),
      dueConfig({ id: "config_next", nextCheckAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([
        ["config_big", MAX_KEYWORDS_PER_CONFIG],
        ["config_next", 5],
      ]),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTick();

    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    expect(mocks.claimDueConfig).toHaveBeenCalledTimes(1);
    expect(mocks.customerHasPaidPlan).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stoppedByBudget: true,
        unitsStarted: MAX_KEYWORDS_PER_CONFIG * 2,
      }),
    );
  });

  it("skips a config whose claim lost to a concurrent edit", async () => {
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_edited" }),
      dueConfig({ id: "config_2", nextCheckAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([
        ["config_edited", 5],
        ["config_2", 5],
      ]),
    );
    mocks.claimDueConfig.mockResolvedValueOnce(false);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTick();

    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    expect(mocks.beginRankCheckRun.mock.calls[0][0].config.id).toBe("config_2");
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ concurrentChangeSkips: 1, started: 1 }),
    );
  });

  it("contains a per-config failure and still processes the rest of the tick", async () => {
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_bad" }),
      dueConfig({ id: "config_ok", nextCheckAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([
        ["config_bad", 5],
        ["config_ok", 5],
      ]),
    );
    mocks.claimDueConfig.mockRejectedValueOnce(new Error("db blip"));
    // A tick with errors logs its summary at error level.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runTick();

    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    expect(mocks.beginRankCheckRun.mock.calls[0][0].config.id).toBe(
      "config_ok",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ configErrors: 1, started: 1 }),
    );
  });

  it("defers a config whose units would overflow the remaining budget", async () => {
    // First config fits (10 units); the second (legal-max, over the whole
    // budget) would overflow, so it is deferred rather than admitted just
    // because budget remains.
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_small" }),
      dueConfig({ id: "config_big", nextCheckAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([
        ["config_small", 5],
        ["config_big", MAX_KEYWORDS_PER_CONFIG],
      ]),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTick();

    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    expect(mocks.beginRankCheckRun.mock.calls[0][0].config.id).toBe(
      "config_small",
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stoppedByBudget: true, unitsStarted: 10 }),
    );
  });

  it("stops the tick at the wall-clock deadline instead of running long", async () => {
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_1" }),
      dueConfig({ id: "config_2", nextCheckAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    const start = Date.now();
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(start) // deadline anchor
      .mockReturnValue(start + 4 * 60_000); // every later check is past it
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTick();

    expect(mocks.beginRankCheckRun).not.toHaveBeenCalled();
    expect(mocks.claimDueConfig).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stoppedByDeadline: true, started: 0 }),
    );
  });

  it("restores the original due time when a run is already active", async () => {
    mocks.beginRankCheckRun.mockResolvedValue({
      ok: false,
      reason: "already_running",
      blockingRunId: "run_blocking",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTick();

    expect(mocks.claimDueConfig).toHaveBeenCalledTimes(2);
    const [advance] = mocks.claimDueConfig.mock.calls[0];
    const [restore] = mocks.claimDueConfig.mock.calls[1];
    expect(restore).toEqual({
      configId: "config_1",
      projectId: "project_1",
      observedNextCheckAt: advance.nextCheckAt,
      nextCheckAt: "2026-01-01T00:00:00.000Z",
    });
    // Blocked configs leave no durable row state, so the summary names them.
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        alreadyRunning: 1,
        alreadyRunningConfigIds: ["config_1"],
      }),
    );
  });

  it("leaves a config due when its plan check throws, and still processes other orgs", async () => {
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      dueConfig({ id: "config_a1", organizationId: "org_a" }),
      dueConfig({
        id: "config_a2",
        organizationId: "org_a",
        nextCheckAt: "2026-01-02T00:00:00.000Z",
      }),
      dueConfig({
        id: "config_b",
        organizationId: "org_b",
        nextCheckAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([
        ["config_a1", 5],
        ["config_a2", 5],
        ["config_b", 5],
      ]),
    );
    mocks.customerHasPaidPlan.mockImplementation(async (orgId: string) => {
      if (orgId === "org_a") throw new Error("autumn down");
      return true;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runTick();

    // One Autumn call per org per tick — org_a's rejection is memoized.
    expect(mocks.customerHasPaidPlan).toHaveBeenCalledTimes(2);
    expect(mocks.claimDueConfig).toHaveBeenCalledTimes(1);
    expect(mocks.claimDueConfig).toHaveBeenCalledWith(
      expect.objectContaining({ configId: "config_b" }),
    );
    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
  });

  it("makes no billing calls in self-hosted mode", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);

    await runTick();

    expect(mocks.customerHasPaidPlan).not.toHaveBeenCalled();
    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
  });
});
