import { beforeEach, describe, expect, it, vi } from "vitest";

interface CreateWrite {
  business?: {
    projectId: string;
    placeId?: string | null;
    latitude: number;
    longitude: number;
  };
  config: {
    projectId: string;
    name: string;
    centerLatitude: number;
    centerLongitude: number;
    nextScanAt?: string | null;
  };
  keywords: Array<{ keyword: string }>;
}

interface UpdateWrite {
  updates: {
    isActive?: boolean;
    nextScanAt?: string | null;
  };
  keywords?: Array<{ keyword: string }>;
}

const workflow = vi.hoisted(() => ({
  create: vi.fn<
    (input: {
      id: string;
      params: {
        languageCode: string;
        seDomain: string | null;
        searchDepth: number;
        searchPlaces: boolean;
        target: {
          placeId: string | null;
          cid: string | null;
          featureId: string | null;
        };
      };
    }) => Promise<void>
  >(),
  get: vi.fn(),
}));
const isHostedServerAuthMode = vi.hoisted(() => vi.fn());

vi.mock("cloudflare:workers", () => ({
  env: { LOCAL_GRID_WORKFLOW: workflow },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode,
}));

const repository = vi.hoisted(() => ({
  findBusinessByStableIdentifiers:
    vi.fn<() => Promise<{ id: string } | null>>(),
  updateBusiness:
    vi.fn<
      (
        businessId: string,
        projectId: string,
        data: Record<string, unknown>,
      ) => Promise<void>
    >(),
  createConfig: vi.fn<(input: CreateWrite) => Promise<void>>(),
  listConfigs: vi.fn<() => Promise<unknown[]>>(),
  getConfig: vi.fn<() => Promise<unknown>>(),
  updateConfig: vi.fn<(input: UpdateWrite) => Promise<void>>(),
  archiveConfig: vi.fn<() => Promise<{ id: string } | null>>(),
  tryCreateRun: vi.fn<() => Promise<boolean>>(),
  insertRunPoints: vi.fn<
    (
      points: Array<{
        rowIndex: number;
        columnIndex: number;
        latitude: number;
        longitude: number;
      }>,
    ) => Promise<void>
  >(),
  insertRunResults: vi.fn<(results: unknown[]) => Promise<void>>(),
  getActiveRun:
    vi.fn<
      () => Promise<{ id: string; status: string; startedAt: string } | null>
    >(),
  updateRun: vi.fn<() => Promise<void>>(),
  getLatestRun: vi.fn<() => Promise<unknown>>(),
  getRunGridResults: vi.fn<() => Promise<unknown[]>>(),
}));
const rankingRepository = vi.hoisted(() => ({
  getRunRankings: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("../repositories/LocalGridRepository", () => ({
  LocalGridRepository: repository,
}));
vi.mock("../repositories/LocalGridRankingRepository", () => ({
  LocalGridRankingRepository: rankingRepository,
}));

import { LocalGridService } from "./LocalGridService";

const projectId = "00000000-0000-4000-8000-000000000001";

function scanDetails() {
  return {
    config: {
      id: "00000000-0000-4000-8000-000000000002",
      isActive: true,
      centerLatitude: 50.8179,
      centerLongitude: -0.3729,
      gridSize: 3,
      radiusMeters: 1_000,
      languageCode: "en",
      seDomain: "google.co.uk",
      searchDepth: 20,
      searchPlaces: false,
    },
    business: {
      name: "Worthing Lofts",
      placeId: "ChIJ-worthing",
      cid: null,
      featureId: null,
    },
    keywords: [
      { id: "keyword-1", keyword: "loft conversions" },
      { id: "keyword-2", keyword: "loft company" },
    ],
  };
}

describe("LocalGridService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    isHostedServerAuthMode.mockResolvedValue(false);
  });

  it("materializes the grid and starts one durable scan workflow", async () => {
    repository.getConfig.mockResolvedValue(scanDetails());
    repository.tryCreateRun.mockResolvedValue(true);
    repository.insertRunPoints.mockResolvedValue(undefined);
    repository.insertRunResults.mockResolvedValue(undefined);
    workflow.create.mockResolvedValue(undefined);

    const result = await LocalGridService.triggerScan({
      configId: "00000000-0000-4000-8000-000000000002",
      projectId,
      billingCustomer: {
        userId: "user-1",
        userEmail: "user@example.com",
        organizationId: "org-1",
        projectId,
      },
    });

    expect(result).toMatchObject({ ok: true });
    expect(repository.tryCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({ taskCount: 18 }),
    );
    const points = repository.insertRunPoints.mock.calls.at(0)?.[0];
    expect(points).toHaveLength(9);
    expect(points?.[4]).toMatchObject({
      rowIndex: 1,
      columnIndex: 1,
      latitude: 50.8179,
      longitude: -0.3729,
    });
    const results = repository.insertRunResults.mock.calls.at(0)?.[0];
    expect(results).toHaveLength(18);
    const workflowInput = workflow.create.mock.calls[0]?.[0];
    expect(workflowInput?.id).toBe(result.ok ? result.runId : "");
    expect(workflowInput?.params).toMatchObject({
      languageCode: "en",
      seDomain: "google.co.uk",
      searchDepth: 20,
      searchPlaces: false,
      target: {
        placeId: "ChIJ-worthing",
        cid: null,
        featureId: null,
      },
    });
  });

  it("returns the active run instead of starting a duplicate scan", async () => {
    repository.getConfig.mockResolvedValue({
      config: {
        isActive: true,
        centerLatitude: 50,
        centerLongitude: -1,
        gridSize: 3,
        radiusMeters: 1_000,
      },
      business: {},
      keywords: [{ id: "keyword-1", keyword: "builder" }],
    });
    repository.tryCreateRun.mockResolvedValue(false);
    repository.getActiveRun.mockResolvedValue({
      id: "active-run",
      status: "running",
      startedAt: "2026-08-25T00:00:00.000Z",
    });

    await expect(
      LocalGridService.triggerScan({
        configId: "00000000-0000-4000-8000-000000000002",
        projectId,
        billingCustomer: {
          userId: "user-1",
          userEmail: "user@example.com",
          organizationId: "org-1",
        },
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "already_running",
      blockingRunId: "active-run",
    });
    expect(repository.insertRunPoints).not.toHaveBeenCalled();
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it("does not start hosted scans before atomic credit reservation exists", async () => {
    isHostedServerAuthMode.mockResolvedValue(true);
    repository.getConfig.mockResolvedValue({
      config: { isActive: true },
      business: {},
      keywords: [{ id: "keyword-1", keyword: "builder" }],
    });

    await expect(
      LocalGridService.triggerScan({
        configId: "00000000-0000-4000-8000-000000000002",
        projectId,
        billingCustomer: {
          userId: "user-1",
          userEmail: "user@example.com",
          organizationId: "org-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message:
        "Hosted map grid scans are unavailable until credit reservation is enabled",
    });
    expect(repository.tryCreateRun).not.toHaveBeenCalled();
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it("releases the active-run slot when workflow startup fails", async () => {
    repository.getConfig.mockResolvedValue({
      config: {
        isActive: true,
        centerLatitude: 50,
        centerLongitude: -1,
        gridSize: 3,
        radiusMeters: 1_000,
      },
      business: {},
      keywords: [{ id: "keyword-1", keyword: "builder" }],
    });
    repository.tryCreateRun.mockResolvedValue(true);
    repository.insertRunPoints.mockResolvedValue(undefined);
    repository.insertRunResults.mockResolvedValue(undefined);
    repository.updateRun.mockResolvedValue(undefined);
    workflow.create.mockRejectedValue(new Error("workflow unavailable"));
    workflow.get.mockRejectedValue(new Error("not created"));

    await expect(
      LocalGridService.triggerScan({
        configId: "00000000-0000-4000-8000-000000000002",
        projectId,
        billingCustomer: {
          userId: "user-1",
          userEmail: "user@example.com",
          organizationId: "org-1",
        },
      }),
    ).rejects.toThrow("workflow unavailable");
    expect(repository.updateRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: "failed",
        errorMessage: "Failed to start map grid workflow",
      }),
    );
  });

  it("returns the latest run grid after authorizing the config", async () => {
    repository.getConfig.mockResolvedValue({
      config: { id: "config-1", gridSize: 3 },
      business: {
        name: "Worthing Lofts",
        placeId: "ChIJ-worthing",
        cid: null,
        featureId: null,
      },
      keywords: [{ id: "current-keyword", keyword: "plumber" }],
    });
    repository.getLatestRun.mockResolvedValue({
      id: "run-1",
      status: "completed",
      taskCount: 9,
      tasksCompleted: 9,
      providerCostUsd: 0.0054,
      errorMessage: null,
      startedAt: "2026-08-25T00:00:00.000Z",
      completedAt: "2026-08-25T00:10:00.000Z",
    });
    repository.getRunGridResults.mockResolvedValue([
      {
        resultId: "result-1",
        pointId: "point-1",
        trackingKeywordId: "keyword-1",
        keyword: "builder",
        rowIndex: 0,
        columnIndex: 0,
        latitude: 50.8,
        longitude: -0.3,
        status: "completed",
        targetRank: 2,
        matchedBy: "place_id",
        errorMessage: null,
      },
    ]);
    rankingRepository.getRunRankings.mockResolvedValue([
      {
        trackingKeywordId: "keyword-1",
        rank: 1,
        placeId: "ChIJ-competitor",
        cid: null,
        featureId: null,
        name: "Competitor A",
        rating: 4.7,
        reviewCount: 62,
      },
      {
        trackingKeywordId: "keyword-1",
        rank: 2,
        placeId: "ChIJ-worthing",
        cid: null,
        featureId: null,
        name: "Worthing Lofts",
        rating: 4.8,
        reviewCount: 25,
      },
    ]);

    await expect(
      LocalGridService.getResults(
        "00000000-0000-4000-8000-000000000002",
        projectId,
      ),
    ).resolves.toMatchObject({
      run: { id: "run-1", status: "completed" },
      gridSize: 1,
      keywords: [{ id: "keyword-1", keyword: "builder" }],
      cells: [{ resultId: "result-1", targetRank: 2 }],
      competitors: [
        {
          name: "Competitor A",
          averageRank: 1,
          coveragePercent: 100,
        },
      ],
    });
    expect(repository.getConfig).toHaveBeenCalledOnce();
    expect(repository.getRunGridResults).toHaveBeenCalledWith("run-1");
    expect(rankingRepository.getRunRankings).toHaveBeenCalledWith("run-1");
  });
});
