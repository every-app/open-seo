import { beforeEach, describe, expect, it, vi } from "vitest";

const workflow = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }));
const reconcilePendingLocalGridRun = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({
  getConfig: vi.fn(),
  tryCreateRun: vi.fn(),
  getActiveRun: vi.fn(),
  insertRunPoints: vi.fn(),
  insertRunResults: vi.fn(),
  updateRun: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { LOCAL_GRID_WORKFLOW: workflow },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(async () => false),
}));
vi.mock("../repositories/LocalGridRepository", () => ({
  LocalGridRepository: repository,
}));
vi.mock("./localGridRunGuards", () => ({ reconcilePendingLocalGridRun }));

import { LocalGridService } from "./LocalGridService";

const projectId = "00000000-0000-4000-8000-000000000001";
const configId = "00000000-0000-4000-8000-000000000002";
const input = {
  configId,
  projectId,
  billingCustomer: {
    userId: "user-1",
    userEmail: "user@example.com",
    organizationId: "org-1",
  },
};

function scanDetails() {
  return {
    config: {
      isActive: true,
      centerLatitude: 50,
      centerLongitude: -1,
      gridSize: 3,
      radiusMeters: 1_000,
      languageCode: "en",
      seDomain: null,
      searchDepth: 20,
      searchPlaces: false,
    },
    business: { placeId: "place-1", cid: null, featureId: null },
    keywords: [{ id: "keyword-1", keyword: "builder" }],
  };
}

describe("LocalGridService stale-run recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getConfig.mockResolvedValue(scanDetails());
  });

  it("retries once after recovering an orphaned run", async () => {
    repository.tryCreateRun
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    repository.getActiveRun.mockResolvedValue({
      id: "stale-run",
      status: "pending",
      startedAt: "2026-08-25T00:00:00.000Z",
    });
    reconcilePendingLocalGridRun.mockResolvedValue("recovered");
    workflow.create.mockResolvedValue(undefined);

    await expect(LocalGridService.triggerScan(input)).resolves.toMatchObject({
      ok: true,
    });
    expect(repository.tryCreateRun).toHaveBeenCalledTimes(2);
    expect(workflow.create).toHaveBeenCalledOnce();
  });

  it("does not retry when another reconciler wins", async () => {
    repository.tryCreateRun.mockResolvedValue(false);
    repository.getActiveRun
      .mockResolvedValueOnce({
        id: "stale-run",
        status: "pending",
        startedAt: "2026-08-25T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "new-run",
        status: "pending",
        startedAt: "2026-08-25T00:01:00.000Z",
      });
    reconcilePendingLocalGridRun.mockResolvedValue("lost_race");

    await expect(LocalGridService.triggerScan(input)).resolves.toEqual({
      ok: false,
      reason: "already_running",
      blockingRunId: "new-run",
    });
    expect(repository.tryCreateRun).toHaveBeenCalledOnce();
    expect(workflow.create).not.toHaveBeenCalled();
  });
});
