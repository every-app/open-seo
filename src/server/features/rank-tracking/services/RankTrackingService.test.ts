import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfigByProjectDomainLocation: vi.fn(),
  getConfigsForProject: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  updateKeywordMetrics: vi.fn(),
  route: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => ({ route: mocks.route }),
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
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

describe("RankTrackingService.createConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("reactivates an archived config instead of throwing, applying the new settings", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(archivedConfig);
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.updateConfig.mockResolvedValue(undefined);
    const { RankTrackingService } = await import("./RankTrackingService");

    await expect(RankTrackingService.createConfig(baseInput)).resolves.toEqual({
      configId: "config_archived",
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
    const { RankTrackingService } = await import("./RankTrackingService");

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
    const { RankTrackingService } = await import("./RankTrackingService");

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
    const { MAX_CONFIGS_PER_PROJECT } = await import("@/shared/rank-tracking");
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(archivedConfig);
    mocks.getConfigsForProject.mockResolvedValue(
      Array.from({ length: MAX_CONFIGS_PER_PROJECT }, (_, i) => ({
        ...archivedConfig,
        id: `config_${i}`,
        isActive: true,
      })),
    );
    const { RankTrackingService } = await import("./RankTrackingService");

    await expect(
      RankTrackingService.createConfig(baseInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("creates a new config when none exists for the domain + location", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(null);
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.createConfig.mockResolvedValue(undefined);
    const { RankTrackingService } = await import("./RankTrackingService");

    const result = await RankTrackingService.createConfig(baseInput);

    expect(result.configId).toBeTruthy();
    expect(mocks.createConfig).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.configId,
        projectId: "project_1",
        domain: "acme.com",
        devices: "desktop",
        serpDepth: 40,
        scheduleInterval: "daily",
      }),
    );
  });

  it("uses the project's market when location and language are omitted", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(null);
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.createConfig.mockResolvedValue(undefined);
    const { RankTrackingService } = await import("./RankTrackingService");

    await RankTrackingService.createConfig({
      projectId: "project_1",
      projectMarket: { locationCode: 2704, languageCode: "vi" },
      domain: "acme.com",
      serpDepth: 40,
    });

    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2704, languageCode: "vi" }),
    );
  });

  it("snaps the language when only location overrides the project market", async () => {
    mocks.getConfigByProjectDomainLocation.mockResolvedValue(null);
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.createConfig.mockResolvedValue(undefined);
    const { RankTrackingService } = await import("./RankTrackingService");

    await RankTrackingService.createConfig({
      projectId: "project_1",
      projectMarket: { locationCode: 2704, languageCode: "vi" },
      domain: "acme.com",
      locationCode: 2276,
      serpDepth: 40,
    });

    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2276, languageCode: "de" }),
    );
  });
});

describe("RankTrackingService.refreshKeywordMetrics", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getConfigById.mockResolvedValue({
      id: "config_1",
      projectId: "project_1",
      locationCode: 2840,
      languageCode: "en",
      locationName: null,
    });
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "keyword_1", keyword: "seo software" },
    ]);
    mocks.route.mockResolvedValue({
      data: [
        {
          keyword: "seo software",
          searchVolume: 100,
          keywordDifficulty: 20,
          cpc: 3.5,
        },
      ],
    });
  });

  it("routes metrics through keyword_metrics with project and market context", async () => {
    const { RankTrackingService } = await import("./RankTrackingService");
    const billingCustomer = {
      organizationId: "org_1",
      userId: "user_1",
      userEmail: "user@example.com",
    };

    await expect(
      RankTrackingService.refreshKeywordMetrics(
        "config_1",
        "project_1",
        billingCustomer,
      ),
    ).resolves.toEqual({ updated: 1 });

    expect(mocks.route).toHaveBeenCalledWith({
      dataType: "keyword_metrics",
      keywords: ["seo software"],
      locationCode: 2840,
      languageCode: "en",
      billingCustomer,
      creditFeature: "rank_tracking",
      constraints: { projectId: "project_1" },
    });
    expect(mocks.updateKeywordMetrics).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "keyword_1",
        searchVolume: 100,
        keywordDifficulty: 20,
        cpc: 3.5,
      }),
    ]);
  });

  it("preserves local location-name semantics in the router request", async () => {
    mocks.getConfigById.mockResolvedValue({
      id: "config_1",
      projectId: "project_1",
      locationCode: 2840,
      languageCode: "en",
      locationName: "Enid,Oklahoma,United States",
    });
    const { RankTrackingService } = await import("./RankTrackingService");

    await RankTrackingService.refreshKeywordMetrics("config_1", "project_1", {
      organizationId: "org_1",
      userId: "user_1",
      userEmail: "user@example.com",
    });

    expect(mocks.route).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: {
          projectId: "project_1",
          locationName: "Enid,Oklahoma,United States",
        },
      }),
    );
  });
});
