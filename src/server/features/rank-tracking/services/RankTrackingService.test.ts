import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CONFIGS_PER_PROJECT } from "@/shared/rank-tracking";
import type * as RunGuards from "./rankCheckRunGuards";
import { RankTrackingService } from "./RankTrackingService";

const mocks = vi.hoisted(() => ({
  getConfigByProjectDomainLocation: vi.fn(),
  getConfigById: vi.fn(),
  getConfigsForProject: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
  getActiveRunForConfig: vi.fn(),
  deleteConfigCascade: vi.fn(),
  reconcileActiveRankCheckRun: vi.fn(),
  getKeywordCountsForConfigs: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  tryCreateRun: vi.fn(),
  startWorkflow: vi.fn(),
  isHosted: vi.fn(),
  customerHasPaidPlan: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { RANK_CHECK_WORKFLOW: { create: mocks.startWorkflow } },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: () => Promise.resolve("basic-key"),
  isHostedServerAuthMode: mocks.isHosted,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock("@/server/lib/dataforseo", () => ({ createDataforseoClient: vi.fn() }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("./rankCheckRunGuards", async (importOriginal) => ({
  ...(await importOriginal<typeof RunGuards>()),
  reconcileActiveRankCheckRun: mocks.reconcileActiveRankCheckRun,
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/deleteConfigCascade",
  () => ({ deleteConfigCascade: mocks.deleteConfigCascade }),
);

const archivedConfig = {
  id: "config_archived",
  projectId: "project_1",
  domain: "acme.com",
  locationCode: 2840,
  languageCode: "en",
  devices: "both" as const,
  serpDepth: 20,
  scheduleInterval: "weekly" as const,
  isActive: false,
  lastSkipReason: "insufficient_credits",
};

const baseInput = {
  projectId: "project_1",
  projectMarket: { locationCode: 2704, languageCode: "vi" },
  domain: "acme.com",
  locationCode: 2840,
  languageCode: "es",
  devices: "desktop" as const,
  serpDepth: 40,
  scheduleInterval: "daily" as const,
};

/** The DataForSEO sandbox reply the location validator parses. */
function stubSandbox(statusCode: number, statusMessage = "Ok.") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tasks: [{ status_code: statusCode, status_message: statusMessage }],
        }),
        { status: 200 },
      ),
    ),
  );
}

describe("RankTrackingService.createConfig", () => {
  beforeEach(() => {
    stubSandbox(20000);
  });

  it("reactivates an archived config instead of throwing, applying the new settings", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(archivedConfig);
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.updateConfig.mockResolvedValue(undefined);
    mocks.getConfigById.mockResolvedValue({
      ...archivedConfig,
      languageCode: "es",
      devices: "desktop",
      serpDepth: 40,
      scheduleInterval: "daily",
      isActive: true,
      lastSkipReason: null,
    });

    await expect(
      RankTrackingService.createConfig(baseInput),
    ).resolves.toMatchObject({
      id: "config_archived",
      isActive: true,
      languageCode: "es",
      devices: "desktop",
    });

    expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).toHaveBeenCalledWith(
      "config_archived",
      "project_1",
      expect.objectContaining({
        isActive: true,
        languageCode: "es",
        devices: "desktop",
        serpDepth: 40,
        scheduleInterval: "daily",
        lastSkipReason: null,
      }),
    );
    // Reactivation must not insert a duplicate row.
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("throws when an active config already tracks the same domain + location", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue({
      ...archivedConfig,
      isActive: true,
    });

    await expect(
      RankTrackingService.createConfig(baseInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("keys the duplicate check on locationName so national and city configs coexist", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(null);
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.createConfig.mockResolvedValue(undefined);

    // Local config: the lookup must be scoped to this exact city, so an
    // existing national row for the same domain doesn't collide.
    await RankTrackingService.createConfig({
      ...baseInput,
      locationName: "Enid,Oklahoma,United States",
    });
    expect(mocks.getConfigByProjectDomainLocation).toHaveBeenCalledWith(
      "project_1",
      "acme.com",
      2840,
      "Enid,Oklahoma,United States",
    );

    // National config: the lookup is scoped to NULL locationName.
    await RankTrackingService.createConfig(baseInput);
    expect(mocks.getConfigByProjectDomainLocation).toHaveBeenLastCalledWith(
      "project_1",
      "acme.com",
      2840,
      null,
    );
  });

  it("rejects reactivating an archived config when the project is at the active-config cap", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(archivedConfig);
    mocks.getConfigsForProject.mockResolvedValue(
      Array.from({ length: MAX_CONFIGS_PER_PROJECT }, (_, i) => ({
        ...archivedConfig,
        id: `config_${i}`,
        isActive: true,
      })),
    );

    await expect(
      RankTrackingService.createConfig(baseInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  // Omitted fields fall back to the project market; a location alone snaps
  // the language to that location, not to the project's.
  it.each([
    ["the project's market", {}, { locationCode: 2704, languageCode: "vi" }],
    [
      "the location's language",
      { locationCode: 2276 },
      { locationCode: 2276, languageCode: "de" },
    ],
  ])(
    "resolves an omitted language to %s",
    async (_case, overrides, expected) => {
      mocks.getConfigByProjectDomainLocation.mockResolvedValue(null);
      mocks.getConfigsForProject.mockResolvedValue([]);
      mocks.createConfig.mockResolvedValue(undefined);

      await RankTrackingService.createConfig({
        projectId: "project_1",
        projectMarket: { locationCode: 2704, languageCode: "vi" },
        domain: "acme.com",
        serpDepth: 40,
        ...overrides,
      });

      expect(mocks.createConfig).toHaveBeenCalledWith(
        expect.objectContaining(expected),
      );
    },
  );

  it("rejects a locationName the sandbox refuses, pointing at search_serp_locations", async () => {
    stubSandbox(40501, "Invalid Field: 'location_name'.");
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(null);
    mocks.getConfigsForProject.mockResolvedValue([]);

    const error = await RankTrackingService.createConfig({
      ...baseInput,
      locationName: "Catonsville, MD",
    }).catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(String(error)).toContain("search_serp_locations");
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });
});

describe("RankTrackingService.deleteTracker", () => {
  const trackerConfig = {
    id: "config_1",
    projectId: "project_1",
    domain: "acme.com",
    locationCode: 2840,
    languageCode: "en",
    locationName: null,
    devices: "both" as const,
    serpDepth: 20,
    scheduleInterval: "weekly" as const,
    isActive: true,
  };

  it("refuses while a rank check is genuinely in flight", async () => {
    mocks.getConfigById.mockResolvedValue(trackerConfig);
    mocks.getActiveRunForConfig.mockResolvedValue({
      id: "run_1",
      status: "running",
    });
    mocks.reconcileActiveRankCheckRun.mockResolvedValue(null);

    await expect(
      RankTrackingService.deleteTracker("config_1", "project_1"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.deleteConfigCascade).not.toHaveBeenCalled();
  });

  it("deletes when the only active-looking run is stale, reporting the keyword count", async () => {
    mocks.getConfigById.mockResolvedValue(trackerConfig);
    mocks.getActiveRunForConfig.mockResolvedValue({
      id: "run_1",
      status: "running",
    });
    mocks.reconcileActiveRankCheckRun.mockResolvedValue({
      errorMessage: "Rank check workflow instance no longer exists",
      completedAt: "2026-08-01T12:00:00.000Z",
    });
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([["config_1", 3]]),
    );
    mocks.deleteConfigCascade.mockResolvedValue(undefined);

    await expect(
      RankTrackingService.deleteTracker("config_1", "project_1"),
    ).resolves.toEqual({ config: trackerConfig, keywordCount: 3 });
    expect(mocks.deleteConfigCascade).toHaveBeenCalledWith("config_1");
  });
});

describe("RankTrackingService.updateConfig schedule", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({
      ...archivedConfig,
      isActive: true,
      nextCheckAt: "2026-03-15T21:00:00.000Z",
    });
  });

  it("keeps the run time when a save resends an unchanged interval", async () => {
    await RankTrackingService.updateConfig("config_archived", "project_1", {
      devices: "mobile",
      scheduleInterval: "weekly",
    });

    expect(mocks.updateConfig.mock.calls[0][2]).toEqual({ devices: "mobile" });
  });

  it("moves the run time to a chosen time", async () => {
    vi.useFakeTimers();
    // A Tuesday.
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    await RankTrackingService.updateConfig("config_archived", "project_1", {
      scheduleTime: { weekday: 1, hour: 9, minute: 30 },
    });
    vi.useRealTimers();

    expect(mocks.updateConfig).toHaveBeenCalledWith(
      "config_archived",
      "project_1",
      { scheduleInterval: "weekly", nextCheckAt: "2026-03-16T09:30:00.000Z" },
    );
  });

  it.each([
    [
      "a weekly time without a weekday",
      { scheduleTime: { hour: 9, minute: 30 } },
    ],
    [
      "a chosen time on a manual schedule",
      {
        scheduleInterval: "manual" as const,
        scheduleTime: { hour: 9, minute: 30 },
      },
    ],
  ])("rejects %s", async (_case, input) => {
    await expect(
      RankTrackingService.updateConfig("config_archived", "project_1", input),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
});

const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

describe("RankTrackingService.triggerAutoCheck", () => {
  const input = {
    configId: "config_archived",
    projectId: "project_1",
    billingCustomer: {
      userId: "user_1",
      userEmail: "user@openseo.so",
      organizationId: "org_1",
      projectId: "project_1",
    },
  };

  beforeEach(() => {
    mocks.getKeywordCountsForConfigs.mockResolvedValue(
      new Map([["config_archived", 2]]),
    );
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1" },
      { id: "kw_2" },
    ]);
    mocks.tryCreateRun.mockResolvedValue(true);
    mocks.isHosted.mockResolvedValue(false);
  });

  it("starts a check when the scheduled check is more than an hour away", async () => {
    mocks.getConfigById.mockResolvedValue({
      ...archivedConfig,
      nextCheckAt: minutesFromNow(61),
    });

    await expect(
      RankTrackingService.triggerAutoCheck(input),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.startWorkflow).toHaveBeenCalledTimes(1);
  });

  it("leaves the keywords to a scheduled check due within the hour", async () => {
    mocks.getConfigById.mockResolvedValue({
      ...archivedConfig,
      nextCheckAt: minutesFromNow(59),
    });

    await expect(RankTrackingService.triggerAutoCheck(input)).resolves.toEqual({
      ok: false,
      reason: "scheduled_soon",
    });
    expect(mocks.startWorkflow).not.toHaveBeenCalled();
  });

  it("refuses a free plan before promising a scheduled check", async () => {
    mocks.isHosted.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(false);
    mocks.getConfigById.mockResolvedValue({
      ...archivedConfig,
      nextCheckAt: minutesFromNow(59),
    });

    await expect(
      RankTrackingService.triggerAutoCheck(input),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });

  it("starts nothing for a domain without keywords", async () => {
    mocks.getConfigById.mockResolvedValue({
      ...archivedConfig,
      nextCheckAt: null,
    });
    mocks.getKeywordCountsForConfigs.mockResolvedValue(new Map());

    await expect(RankTrackingService.triggerAutoCheck(input)).resolves.toEqual({
      ok: false,
      reason: "no_keywords",
    });
    expect(mocks.startWorkflow).not.toHaveBeenCalled();
  });
});
