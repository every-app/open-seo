import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankTrackingService } from "./RankTrackingService";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  addKeywordsToConfig: vi.fn(),
  removeKeywordsFromConfig: vi.fn(),
  updateKeywordMetrics: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  customerHasPaidPlan: vi.fn(),
  getPaidPlanId: vi.fn(),
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
  getPaidPlanId: mocks.getPaidPlanId,
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

const tracker = {
  configId: "config_1",
  projectId: "project_1",
  organizationId: "org_1",
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
    // Persistent implementations survive clearMocks, so the billing gates get
    // explicit defaults; the plan tests override them per case.
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(true);
  });

  it("reports only keyword rows actually inserted", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => [rows[0]?.id],
    );

    const result = await RankTrackingService.addKeywords(
      tracker,
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

  it("lowercases with the tracker's language, so Turkish I and İ keep their letters", async () => {
    mocks.getConfigById.mockResolvedValue({ ...config, languageCode: "tr" });
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );

    await RankTrackingService.addKeywords(
      tracker,
      ["İstanbul avukat", "KIRMIZI"],
      { kind: "direct_user_action" },
    );

    expect(mocks.addKeywordsToConfig).toHaveBeenCalledWith([
      expect.objectContaining({ keyword: "istanbul avukat" }),
      expect.objectContaining({ keyword: "kırmızı" }),
    ]);
  });

  it("does not re-add a Turkish keyword stored by the older lowercasing", async () => {
    mocks.getConfigById.mockResolvedValue({ ...config, languageCode: "tr" });
    // "İstanbul".toLowerCase() keeps a combining dot above the i.
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "İstanbul avukat".toLowerCase() },
    ]);

    await RankTrackingService.addKeywords(tracker, ["İstanbul avukat"], {
      kind: "direct_user_action",
    });

    expect(mocks.addKeywordsToConfig).not.toHaveBeenCalled();
  });

  it("keeps case as typed when matchCase is set, alongside the lowercase keyword", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "nodex" },
    ]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );

    await RankTrackingService.addKeywords(
      tracker,
      ["Nodex"],
      { kind: "direct_user_action" },
      true,
    );

    expect(mocks.addKeywordsToConfig).toHaveBeenCalledWith([
      expect.objectContaining({ keyword: "Nodex", matchCase: true }),
    ]);
  });

  it("requires an approved estimate before increasing scheduled spend", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);

    const error: unknown = await RankTrackingService.addKeywords(
      tracker,
      ["seo", "technical seo"],
      { kind: "credit_ceiling" },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error) || !("code" in error)) throw error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("including retries");
    expect(mocks.addKeywordsToConfig).not.toHaveBeenCalled();
  });

  it("adds scheduled keywords at the approved estimate", async () => {
    mocks.getKeywordsForConfig
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { keyword: "seo" },
        { keyword: "technical seo" },
      ]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );

    await expect(
      RankTrackingService.addKeywords(tracker, ["seo", "technical seo"], {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits: 14,
      }),
    ).resolves.toMatchObject({
      added: 2,
      scheduledEstimate: {
        scheduleInterval: "weekly",
        costCredits: 14,
        checksPerMonth: 4,
      },
    });
    expect(mocks.addKeywordsToConfig).toHaveBeenCalledTimes(1);
  });

  it("rolls back its inserts when a concurrent add exceeds the estimate", async () => {
    mocks.getKeywordsForConfig
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { keyword: "seo" },
        { keyword: "technical seo" },
        { keyword: "concurrent add" },
      ]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );
    mocks.removeKeywordsFromConfig.mockImplementation(
      async (ids: string[]) => ids,
    );

    const error: unknown = await RankTrackingService.addKeywords(
      tracker,
      ["seo", "technical seo"],
      {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits: 14,
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
      RankTrackingService.addKeywords(tracker, ["seo"], {
        kind: "credit_ceiling",
      }),
    ).resolves.toMatchObject({ added: 1, scheduledEstimate: undefined });
    expect(mocks.getKeywordsForConfig).toHaveBeenCalledTimes(1);
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

  it("starts a run only at or below its approved credit ceiling", async () => {
    mocks.beginRankCheckRun.mockResolvedValue({ ok: true, runId: "run_1" });
    const run = {
      configId: "config_1",
      projectId: "project_1",
      billingCustomer,
    };

    const error: unknown = await RankTrackingService.triggerCheck({
      ...run,
      maxCostCredits: 13,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error) || !("code" in error)) throw error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("costs 14 credits");
    expect(mocks.beginRankCheckRun).not.toHaveBeenCalled();

    await expect(
      RankTrackingService.triggerCheck({ ...run, maxCostCredits: 14 }),
    ).resolves.toEqual({ ok: true, runId: "run_1" });
    expect(mocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ maxCostCredits: 14 }),
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

  it("matches metrics back to a cased keyword and its lowercase twin", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.createDataforseoClient.mockReturnValue({});
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "Nodex" },
      { id: "kw_2", keyword: "nodex" },
    ]);
    // DataForSEO echoes keywords back lowercased.
    mocks.fetchKeywordMetricsForList.mockResolvedValue([
      { keyword: "nodex", searchVolume: 90, keywordDifficulty: 12, cpc: 0.5 },
    ]);

    await expect(
      RankTrackingService.refreshKeywordMetrics(
        "config_1",
        "project_1",
        billingCustomer,
      ),
    ).resolves.toEqual({ updated: 2 });
    expect(mocks.fetchKeywordMetricsForList).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ keywords: ["nodex"] }),
    );
    expect(mocks.updateKeywordMetrics).toHaveBeenCalledWith([
      expect.objectContaining({ id: "kw_1", searchVolume: 90 }),
      expect.objectContaining({ id: "kw_2", searchVolume: 90 }),
    ]);
  });

  it("fetches keyword stats for a city-code tracker by its country", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.createDataforseoClient.mockReturnValue({});
    mocks.fetchKeywordMetricsForList.mockResolvedValue([]);
    // Saved before location codes were validated: Curitiba's own code.
    mocks.getConfigById.mockResolvedValue({
      ...config,
      locationCode: 1001634,
      languageCode: "pt",
      locationName: "Curitiba,State of Parana,Brazil",
    });

    await RankTrackingService.refreshKeywordMetrics(
      "config_1",
      "project_1",
      billingCustomer,
    );
    expect(mocks.fetchKeywordMetricsForList).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        locationCode: 2076,
        languageCode: "pt",
        locationName: "Curitiba,State of Parana,Brazil",
      }),
    );
  });

  it("rejects missing or foreign trackers with NOT_FOUND before mutation", async () => {
    mocks.getConfigById.mockResolvedValue(null);

    await expect(
      RankTrackingService.removeKeywords("foreign", "project_1", ["kw_1"]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.removeKeywordsFromConfig).not.toHaveBeenCalled();
  });
});

describe("RankTrackingService keyword limit", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({
      ...config,
      scheduleInterval: "manual",
    });
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );
  });

  it.each([
    ["the base plan", true, "base-plan", 1000],
    ["a plan granted by hand", true, null, 1000],
    ["the annual Pro plan", true, "pro-plan-annual", 2500],
    ["the Agency plan", true, "agency-plan", 5000],
    ["the annual Agency plan", true, "agency-plan-annual", 5000],
    ["a deployment without billing", false, null, 5000],
  ])(
    "fills a tracker to its limit on %s and reports what did not fit",
    async (_label, hosted, planId, limit) => {
      mocks.isHostedServerAuthMode.mockResolvedValue(hosted);
      mocks.getPaidPlanId.mockResolvedValue(planId);
      mocks.getKeywordsForConfig.mockResolvedValue(
        Array.from({ length: 999 }, (_, i) => ({ keyword: `tracked ${i}` })),
      );
      const result = await RankTrackingService.addKeywords(
        tracker,
        Array.from({ length: 4500 }, (_, i) => `new ${i}`),
        { kind: "direct_user_action" },
      );

      expect(result.added).toBe(limit - 999);
      expect(result.overLimit).toEqual({
        limit,
        notAdded: 4500 - (limit - 999),
      });
    },
  );

  it("keeps a tracker that is over its limit after a downgrade, and adds nothing", async () => {
    mocks.getPaidPlanId.mockResolvedValue("base-plan");
    mocks.getKeywordsForConfig.mockResolvedValue(
      Array.from({ length: 1500 }, (_, i) => ({ keyword: `tracked ${i}` })),
    );

    const result = await RankTrackingService.addKeywords(
      tracker,
      ["one more"],
      { kind: "direct_user_action" },
    );

    expect(result).toMatchObject({
      added: 0,
      overLimit: { limit: 1000, notAdded: 1 },
    });
    expect(mocks.addKeywordsToConfig).not.toHaveBeenCalled();
    expect(mocks.removeKeywordsFromConfig).not.toHaveBeenCalled();
  });
});
