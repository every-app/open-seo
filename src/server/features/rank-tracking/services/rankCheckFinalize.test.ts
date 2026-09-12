import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeRankCheckRunFromSnapshots } from "./rankCheckFinalize";

const mocks = vi.hoisted(() => ({
  getSnapshotsForRun: vi.fn(),
  updateRun: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);

const baseRun = {
  id: "run_1",
  configId: "config_1",
  projectId: "project_1",
  status: "running" as const,
  keywordsTotal: 2,
  keywordsChecked: 2,
  isSubsetRun: false,
  errorMessage: null,
  startedAt: "2026-09-12T06:00:00.000Z",
  completedAt: null,
};

describe("completeRankCheckRunFromSnapshots", () => {
  beforeEach(() => {
    mocks.getSnapshotsForRun.mockReset();
    mocks.updateRun.mockReset();
    mocks.updateConfig.mockReset();
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.updateConfig.mockResolvedValue(undefined);
  });

  it("completes a running run when every keyword has a snapshot", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_1" },
      { trackingKeywordId: "kw_1" },
      { trackingKeywordId: "kw_2" },
    ]);

    const result = await completeRankCheckRunFromSnapshots({ run: baseRun });

    expect(result).toMatchObject({
      keywordsChecked: 2,
      keywordsTotal: 2,
    });
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "completed",
        keywordsChecked: 2,
        completedAt: expect.any(String),
      }),
    );
    expect(mocks.updateConfig).toHaveBeenCalledWith(
      "config_1",
      "project_1",
      expect.objectContaining({
        lastCheckedAt: expect.any(String),
        lastSkipReason: null,
      }),
    );
  });

  it("skips when snapshot coverage is still incomplete and requireFullCoverage is set", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_1" },
    ]);

    await expect(
      completeRankCheckRunFromSnapshots({
        run: baseRun,
        requireFullCoverage: true,
      }),
    ).resolves.toBeNull();
    expect(mocks.updateRun).not.toHaveBeenCalled();
  });

  it("completes partial coverage when requireFullCoverage is off", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_1" },
    ]);

    const result = await completeRankCheckRunFromSnapshots({ run: baseRun });
    expect(result).toMatchObject({ keywordsChecked: 1, keywordsTotal: 2 });
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "completed",
        keywordsChecked: 1,
        errorMessage: "1 keyword(s) could not be checked",
      }),
    );
  });

  it("skips terminal runs", async () => {
    await expect(
      completeRankCheckRunFromSnapshots({
        run: { ...baseRun, status: "completed" },
      }),
    ).resolves.toBeNull();
    expect(mocks.getSnapshotsForRun).not.toHaveBeenCalled();
  });
});
