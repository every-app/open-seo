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
}));

vi.mock("../repositories/LocalGridRepository", () => ({
  LocalGridRepository: repository,
}));

import {
  computeNextLocalGridScanAt,
  LocalGridService,
} from "./LocalGridService";

const projectId = "00000000-0000-4000-8000-000000000001";

describe("LocalGridService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("creates a config around a confirmed target without calling a provider", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    repository.findBusinessByStableIdentifiers.mockResolvedValue(null);
    repository.createConfig.mockResolvedValue(undefined);

    const result = await LocalGridService.createConfig({
      projectId,
      business: {
        placeId: "ChIJ-worthing",
        name: "Worthing Loft Conversions",
        address: "Worthing, UK",
        latitude: 50.8179,
        longitude: -0.3729,
      },
      name: "Worthing core area",
      gridSize: 5,
      radiusMeters: 4_828,
      distanceUnit: "mi",
      languageCode: "en",
      seDomain: "google.co.uk",
      searchDepth: 20,
      searchPlaces: false,
      scheduleInterval: "weekly",
      keywords: [" Loft Conversions ", "loft conversions", "Loft Company"],
    });

    expect(result.configId).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.createConfig).toHaveBeenCalledOnce();
    const write = repository.createConfig.mock.calls.at(0)?.[0];
    if (!write) throw new Error("Expected a config write");
    expect(write.business).toMatchObject({
      projectId,
      placeId: "ChIJ-worthing",
      latitude: 50.8179,
      longitude: -0.3729,
    });
    expect(write.config).toMatchObject({
      projectId,
      name: "Worthing core area",
      centerLatitude: 50.8179,
      centerLongitude: -0.3729,
      nextScanAt: "2026-08-31T12:00:00.000Z",
    });
    expect(
      write.keywords.map((row: { keyword: string }) => row.keyword),
    ).toEqual(["loft conversions", "loft company"]);
  });

  it("reuses and refreshes an existing stable business", async () => {
    repository.findBusinessByStableIdentifiers.mockResolvedValue({
      id: "business-1",
    });
    repository.createConfig.mockResolvedValue(undefined);

    await LocalGridService.createConfig({
      projectId,
      business: {
        cid: "12345",
        name: "Updated name",
        latitude: 51,
        longitude: -1,
      },
      name: "Grid",
      gridSize: 3,
      radiusMeters: 1_000,
      distanceUnit: "km",
      languageCode: "en",
      seDomain: "google.co.uk",
      searchDepth: 10,
      searchPlaces: false,
      scheduleInterval: "manual",
      keywords: ["builder"],
    });

    expect(repository.updateBusiness).toHaveBeenCalledWith(
      "business-1",
      projectId,
      expect.objectContaining({ name: "Updated name", cid: "12345" }),
    );
    const write = repository.createConfig.mock.calls.at(0)?.[0];
    if (!write) throw new Error("Expected a config write");
    expect(write.business).toBeUndefined();
    expect(write.config.nextScanAt).toBeNull();
  });

  it("replaces keywords and clears the next scan when paused", async () => {
    repository.getConfig.mockResolvedValue({
      config: {
        scheduleInterval: "weekly",
        nextScanAt: "2026-08-31T12:00:00.000Z",
      },
      business: {},
      keywords: [],
    });

    await LocalGridService.updateConfig({
      projectId,
      configId: "00000000-0000-4000-8000-000000000002",
      isActive: false,
      keywords: [" Massage ", "massage", "Thai Massage"],
    });

    const write = repository.updateConfig.mock.calls.at(0)?.[0];
    if (!write) throw new Error("Expected a config update");
    expect(write.updates.isActive).toBe(false);
    expect(write.updates.nextScanAt).toBeNull();
    expect(write.keywords?.map((keyword) => keyword.keyword)).toEqual([
      "massage",
      "thai massage",
    ]);
  });

  it("throws before archive when a config is outside the project", async () => {
    repository.getConfig.mockResolvedValue(null);
    await expect(
      LocalGridService.archiveConfig(
        "00000000-0000-4000-8000-000000000002",
        projectId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.archiveConfig).not.toHaveBeenCalled();
  });
});

describe("computeNextLocalGridScanAt", () => {
  const now = new Date("2026-01-31T12:00:00.000Z");

  it("supports manual, weekly, and calendar-month schedules", () => {
    expect(computeNextLocalGridScanAt("manual", now)).toBeNull();
    expect(computeNextLocalGridScanAt("weekly", now)).toBe(
      "2026-02-07T12:00:00.000Z",
    );
    expect(computeNextLocalGridScanAt("monthly", now)).toBe(
      "2026-02-28T12:00:00.000Z",
    );
  });
});
