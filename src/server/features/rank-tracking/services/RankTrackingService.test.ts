import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfigByProjectDomainLocation: vi.fn(),
  getConfigsForProject: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

const dbMocks = vi.hoisted(() => {
  const dbWhere = vi.fn().mockResolvedValue(undefined);
  const dbSet = vi.fn(() => ({ where: dbWhere }));
  const dbUpdate = vi.fn(() => ({ set: dbSet }));
  return { dbUpdate, dbSet, dbWhere };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { update: dbMocks.dbUpdate } }));
vi.mock("@/server/lib/dataforseo", () => ({ createDataforseoClient: vi.fn() }));
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

import {
  advanceKeywordSchedulesForScheduledRun,
  getDueKeywordsForScheduledRun,
} from "./keywordScheduling";

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

type TestKeyword = {
  id: string;
  scheduleIntervalOverride: "inherit" | "daily" | "weekly" | "manual-paused";
  nextCheckAt: string | null;
};

function keyword(
  id: string,
  scheduleIntervalOverride: TestKeyword["scheduleIntervalOverride"] = "inherit",
  nextCheckAt: string | null = null,
): TestKeyword {
  return { id, scheduleIntervalOverride, nextCheckAt };
}

describe("RankTrackingService keyword scheduling", () => {
  const nowIso = "2026-06-25T12:00:00.000Z";

  beforeEach(() => {
    dbMocks.dbUpdate.mockClear();
    dbMocks.dbSet.mockClear();
    dbMocks.dbWhere.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes due keywords from inherited config intervals and per-keyword overrides", () => {
    const due = getDueKeywordsForScheduledRun(
      {
        scheduleInterval: "weekly",
        nextCheckAt: "2026-06-25T08:00:00.000Z",
      },
      [
        keyword("inherited"),
        keyword("daily-due", "daily", "2026-06-25T11:00:00.000Z"),
        keyword("weekly-due-now", "weekly", null),
        keyword("daily-future", "daily", "2026-06-26T11:00:00.000Z"),
        keyword("paused", "manual-paused", null),
      ],
      nowIso,
    );

    expect(due.map((kw) => kw.id)).toEqual([
      "inherited",
      "daily-due",
      "weekly-due-now",
    ]);
  });

  it("advances nextCheckAt for due per-keyword scheduled overrides", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));

    await advanceKeywordSchedulesForScheduledRun([
      keyword("daily", "daily", "2026-06-23T05:00:00.000Z"),
      keyword("inherited", "inherit", null),
      keyword("paused", "manual-paused", null),
    ]);

    expect(dbMocks.dbSet).toHaveBeenCalledTimes(1);
    expect(dbMocks.dbSet).toHaveBeenCalledWith({
      nextCheckAt: "2026-06-26T05:00:00.000Z",
    });
  });

  it("keeps default due behavior unchanged when no keyword overrides exist", () => {
    const keywords = [keyword("one"), keyword("two")];

    expect(
      getDueKeywordsForScheduledRun(
        {
          scheduleInterval: "weekly",
          nextCheckAt: "2026-06-25T08:00:00.000Z",
        },
        keywords,
        nowIso,
      ).map((kw) => kw.id),
    ).toEqual(["one", "two"]);

    expect(
      getDueKeywordsForScheduledRun(
        {
          scheduleInterval: "weekly",
          nextCheckAt: "2026-06-26T08:00:00.000Z",
        },
        keywords,
        nowIso,
      ),
    ).toEqual([]);

    expect(
      getDueKeywordsForScheduledRun(
        { scheduleInterval: "manual", nextCheckAt: null },
        keywords,
        nowIso,
      ),
    ).toEqual([]);
  });

  it("keeps inherited keywords due on monthly configurations", () => {
    expect(
      getDueKeywordsForScheduledRun(
        { scheduleInterval: "monthly", nextCheckAt: nowIso },
        [keyword("inherited")],
        nowIso,
      ).map((kw) => kw.id),
    ).toEqual(["inherited"]);
  });
});
