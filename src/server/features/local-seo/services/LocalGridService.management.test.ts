import { beforeEach, describe, expect, it, vi } from "vitest";

interface ConfigWrite {
  business?: unknown;
  config: {
    projectId: string;
    centerLatitude: number;
    centerLongitude: number;
    languageCode: string;
    seDomain: string | null;
    scheduleInterval: string;
    nextScanAt: string | null;
  };
  keywords: Array<{ keyword: string }>;
}

interface ConfigUpdateWrite {
  updates: { isActive?: boolean; nextScanAt?: string | null };
  keywords?: Array<{ keyword: string }>;
}

const repository = vi.hoisted(() => ({
  findBusinessByStableIdentifiers:
    vi.fn<() => Promise<{ id: string } | null>>(),
  updateBusiness:
    vi.fn<(id: string, projectId: string, data: unknown) => Promise<void>>(),
  createConfig: vi.fn<(input: ConfigWrite) => Promise<void>>(),
  getConfig: vi.fn<() => Promise<unknown>>(),
  updateConfig: vi.fn<(input: ConfigUpdateWrite) => Promise<void>>(),
  archiveConfig: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(async () => false),
}));
vi.mock("../repositories/LocalGridRepository", () => ({
  LocalGridRepository: repository,
}));

import { LocalGridService } from "./LocalGridService";

const projectId = "00000000-0000-4000-8000-000000000001";

describe("LocalGridService configuration management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a manual config around a confirmed target without a provider", async () => {
    repository.findBusinessByStableIdentifiers.mockResolvedValue(null);

    const result = await LocalGridService.createConfig({
      projectId,
      projectMarket: { languageCode: "en" },
      business: {
        placeId: "ChIJ-worthing",
        name: "Worthing Loft Conversions",
        latitude: 50.8179,
        longitude: -0.3729,
      },
      name: "Worthing core area",
      gridSize: 5,
      radiusMeters: 4_828,
      distanceUnit: "mi",
      seDomain: null,
      searchDepth: 20,
      searchPlaces: false,
      scheduleInterval: "manual",
      keywords: [" Loft Conversions ", "loft conversions", "Loft Company"],
    });

    expect(result.configId).toMatch(/^[0-9a-f-]{36}$/);
    const write = repository.createConfig.mock.calls[0]?.[0];
    expect(write.config).toMatchObject({
      projectId,
      centerLatitude: 50.8179,
      centerLongitude: -0.3729,
      seDomain: null,
      scheduleInterval: "manual",
      nextScanAt: null,
    });
    expect(
      write.keywords.map((row: { keyword: string }) => row.keyword),
    ).toEqual(["loft conversions", "loft company"]);
  });

  it("reuses and refreshes an existing stable business", async () => {
    repository.findBusinessByStableIdentifiers.mockResolvedValue({
      id: "business-1",
    });

    await LocalGridService.createConfig({
      projectId,
      projectMarket: { languageCode: "en" },
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
      seDomain: null,
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
    expect(repository.createConfig.mock.calls[0]?.[0].business).toBeUndefined();
  });

  it("replaces keywords and clears the next scan when disabled", async () => {
    repository.getConfig.mockResolvedValue({
      config: { scheduleInterval: "manual", nextScanAt: null },
      business: {},
      keywords: [],
    });

    await LocalGridService.updateConfig({
      projectId,
      configId: "00000000-0000-4000-8000-000000000002",
      isActive: false,
      keywords: [" Massage ", "massage", "Thai Massage"],
    });

    const write = repository.updateConfig.mock.calls[0]?.[0];
    expect(write.updates).toMatchObject({ isActive: false, nextScanAt: null });
    expect(write.keywords?.map((row) => row.keyword)).toEqual([
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
