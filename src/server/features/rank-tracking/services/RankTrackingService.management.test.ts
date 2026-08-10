import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankTrackingService } from "./RankTrackingService";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  addKeywordsToConfig: vi.fn(),
  removeKeywordsFromConfig: vi.fn(),
  getKeywordCountForConfig: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  customerHasPaidPlan: vi.fn(),
  beginRankCheckRun: vi.fn(),
  createDataforseoClient: vi.fn(),
  fetchKeywordMetricsForList: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { RANK_CHECK_WORKFLOW: {} } }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  beginRankCheckRun: mocks.beginRankCheckRun,
  reconcileActiveRankCheckRun: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  fetchKeywordMetricsForList: mocks.fetchKeywordMetricsForList,
}));

const config = {
  id: "config_1",
  projectId: "project_1",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  locationName: null,
  devices: "both" as const,
  serpDepth: 10,
  scheduleInterval: "weekly" as const,
};

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

describe("RankTrackingService management invariants", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue(config);
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "seo" },
      { id: "kw_2", keyword: "audit" },
    ]);
  });

  it("reports only keyword rows actually inserted", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => [rows[0]?.id],
    );

    const result = await RankTrackingService.addKeywords(
      "config_1",
      "project_1",
      ["SEO", "seo", "technical seo"],
      { kind: "direct_user_action" },
    );

    expect(result).toMatchObject({ added: 1 });
    expect(result.addedIds).toHaveLength(1);
    expect(mocks.addKeywordsToConfig).toHaveBeenCalledWith([
      expect.objectContaining({ keyword: "seo" }),
      expect.objectContaining({ keyword: "technical seo" }),
    ]);
  });

  it("requires an approved estimate before increasing scheduled spend", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);

    const error: unknown = await RankTrackingService.addKeywords(
      "config_1",
      "project_1",
      ["seo", "technical seo"],
      { kind: "credit_ceiling" },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error) || !("code" in error)) throw error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("nominal queued estimate");
    expect(error.message).toContain("Live fallback");
    expect(mocks.addKeywordsToConfig).not.toHaveBeenCalled();
  });

  it("adds scheduled keywords at the approved estimate", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.getKeywordCountForConfig.mockResolvedValue(2);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );

    await expect(
      RankTrackingService.addKeywords(
        "config_1",
        "project_1",
        ["seo", "technical seo"],
        {
          kind: "credit_ceiling",
          maxEstimatedScheduledCheckCredits: 4,
        },
      ),
    ).resolves.toMatchObject({
      added: 2,
      scheduledEstimate: {
        scheduleInterval: "weekly",
        costCredits: 4,
        checksPerMonth: 4,
      },
    });
    expect(mocks.addKeywordsToConfig).toHaveBeenCalledTimes(1);
  });

  it("rolls back its inserts when a concurrent add exceeds the estimate", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.getKeywordCountForConfig.mockResolvedValue(3);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );
    mocks.removeKeywordsFromConfig.mockImplementation(
      async (ids: string[]) => ids,
    );

    const error: unknown = await RankTrackingService.addKeywords(
      "config_1",
      "project_1",
      ["seo", "technical seo"],
      {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits: 4,
      },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error) || !("code" in error)) throw error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(mocks.removeKeywordsFromConfig).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String), expect.any(String)]),
      "config_1",
    );
  });

  it("does not require MCP approval for a manual tracker", async () => {
    mocks.getConfigById.mockResolvedValue({
      ...config,
      scheduleInterval: "manual",
    });
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );

    await expect(
      RankTrackingService.addKeywords("config_1", "project_1", ["seo"], {
        kind: "credit_ceiling",
      }),
    ).resolves.toMatchObject({ added: 1, scheduledEstimate: undefined });
    expect(mocks.getKeywordCountForConfig).not.toHaveBeenCalled();
  });

  it("deduplicates removal IDs and reports only owned rows deleted", async () => {
    mocks.removeKeywordsFromConfig.mockResolvedValue(["owned_id"]);

    const result = await RankTrackingService.removeKeywords(
      "config_1",
      "project_1",
      ["owned_id", "foreign_id", "missing_id", "owned_id"],
    );

    expect(mocks.removeKeywordsFromConfig).toHaveBeenCalledWith(
      ["owned_id", "foreign_id", "missing_id"],
      "config_1",
    );
    expect(result).toEqual({ removed: 1, removedIds: ["owned_id"] });
  });

  it("uses the same live cost invariant exposed to the browser", async () => {
    mocks.getKeywordCountForConfig.mockResolvedValue(5);

    await expect(
      RankTrackingService.estimateCost("config_1", "project_1"),
    ).resolves.toMatchObject({
      keywordCount: 5,
      devicesCount: 2,
      totalChecks: 10,
      method: "live",
      existingKeywordCount: 5,
      additionalKeywordCount: 0,
      scheduledEstimate: {
        scheduleInterval: "weekly",
        checksPerMonth: 4,
      },
    });
  });

  it("rejects a hosted unpaid run before keyword or workflow work", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(false);

    await expect(
      RankTrackingService.triggerCheck({
        configId: "config_1",
        projectId: "project_1",
        billingCustomer,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect(mocks.getKeywordsForConfig).not.toHaveBeenCalled();
    expect(mocks.beginRankCheckRun).not.toHaveBeenCalled();
  });

  it("allows paid hosted and self-hosted runs", async () => {
    mocks.beginRankCheckRun.mockResolvedValue({
      ok: true,
      runId: "run_1",
    });

    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(true);
    await expect(
      RankTrackingService.triggerCheck({
        configId: "config_1",
        projectId: "project_1",
        billingCustomer,
      }),
    ).resolves.toEqual({ ok: true, runId: "run_1" });

    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    // Isolate the second half of this test so it proves self-hosted mode skips
    // the hosted billing lookup.
    mocks.customerHasPaidPlan.mockClear();
    await expect(
      RankTrackingService.triggerCheck({
        configId: "config_1",
        projectId: "project_1",
        billingCustomer,
      }),
    ).resolves.toEqual({ ok: true, runId: "run_1" });
    expect(mocks.customerHasPaidPlan).not.toHaveBeenCalled();
  });

  it("rejects a run above its approved credit ceiling", async () => {
    const error: unknown = await RankTrackingService.triggerCheck({
      configId: "config_1",
      projectId: "project_1",
      billingCustomer,
      maxCostCredits: 11,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error) || !("code" in error)) throw error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("costs 12 credits");
    expect(mocks.beginRankCheckRun).not.toHaveBeenCalled();
  });

  it("starts a run at or below its approved credit ceiling", async () => {
    mocks.beginRankCheckRun.mockResolvedValue({
      ok: true,
      runId: "run_1",
    });

    await expect(
      RankTrackingService.triggerCheck({
        configId: "config_1",
        projectId: "project_1",
        billingCustomer,
        maxCostCredits: 12,
      }),
    ).resolves.toEqual({ ok: true, runId: "run_1" });
    expect(mocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ maxCostCredits: 12 }),
    );
  });

  it("rejects hosted unpaid metrics refresh before provider work", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(false);

    await expect(
      RankTrackingService.refreshKeywordMetrics(
        "config_1",
        "project_1",
        billingCustomer,
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
    expect(mocks.fetchKeywordMetricsForList).not.toHaveBeenCalled();
  });

  it("allows self-hosted metrics refresh without a plan check", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.createDataforseoClient.mockReturnValue({});
    mocks.fetchKeywordMetricsForList.mockResolvedValue([]);

    await expect(
      RankTrackingService.refreshKeywordMetrics(
        "config_1",
        "project_1",
        billingCustomer,
      ),
    ).resolves.toEqual({ updated: 0 });
    expect(mocks.customerHasPaidPlan).not.toHaveBeenCalled();
    expect(mocks.fetchKeywordMetricsForList).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or foreign trackers with NOT_FOUND before mutation", async () => {
    mocks.getConfigById.mockResolvedValue(null);

    await expect(
      RankTrackingService.removeKeywords("foreign", "project_1", ["kw_1"]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.removeKeywordsFromConfig).not.toHaveBeenCalled();
  });
});
