import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import { runLiveCheck } from "./rankCheckPaths";
import { retryRankChecks } from "./rankCheckRetries";

const mocks = vi.hoisted(() => ({
  getSnapshotsForRun: vi.fn(),
  getBestPositionsForKeywords: vi.fn(),
  insertSnapshots: vi.fn(),
  upsertSnapshots: vi.fn(),
  deleteNotFoundSnapshots: vi.fn(),
  setRunErrorIfEmpty: vi.fn(),
  updateRun: vi.fn(),
  fetchRankCheckTaskResult: vi.fn(),
  rankCheckBatch: vi.fn(),
  rankCheckTaskPost: vi.fn(),
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/lib/dataforseo", () => ({
  fetchRankCheckTaskResult: mocks.fetchRankCheckTaskResult,
  MAX_TASKS_PER_POST: 100,
}));
vi.mock("@/server/workflows/pgStep", () => ({
  pgStep: (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => fn(),
}));

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only sleep is reached; pgStep is mocked
const step = { sleep: vi.fn() } as unknown as WorkflowStep;

function checkContext(keywordIds: string[]) {
  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the check paths only call these two serp methods
    client: {
      serp: {
        rankCheckBatch: mocks.rankCheckBatch,
        rankCheckTaskPost: mocks.rankCheckTaskPost,
      },
    } as never,
    keywords: keywordIds.map((id) => ({ id, keyword: `keyword ${id}` })),
    devices: "desktop" as const,
    serpDepth: 10,
    domain: "openseo.so",
    locationCode: 2840,
    languageCode: "en",
    runId: "run_1",
  };
}

function snapshot(keywordId: string, position: number | null) {
  return { trackingKeywordId: keywordId, device: "desktop", position };
}

/** Each task_get answers with the next position. */
function queuedResults(...positions: Array<number | null>) {
  for (const position of positions) {
    mocks.fetchRankCheckTaskResult.mockImplementationOnce(
      async (task: RankCheckTaskInput) => ({
        status: "completed",
        result: { ...task, position, url: null, serpFeatures: [] },
      }),
    );
  }
}

beforeEach(() => {
  mocks.rankCheckBatch.mockImplementation(
    async (inputs: RankCheckTaskInput[]) =>
      inputs.map((input) => ({
        status: "fulfilled",
        value: { ...input, position: 3, url: null, serpFeatures: [] },
      })),
  );
  mocks.rankCheckTaskPost.mockImplementation(
    async ({ tasks }: { tasks: RankCheckTaskInput[] }) =>
      tasks.map((task) => ({ ...task, taskId: `task_${task.keywordId}` })),
  );
  mocks.fetchRankCheckTaskResult.mockImplementation(
    async (task: RankCheckTaskInput) => ({
      status: "completed",
      result: { ...task, position: 5, url: null, serpFeatures: [] },
    }),
  );
  mocks.getBestPositionsForKeywords.mockResolvedValue([
    { trackingKeywordId: "kw_0", position: 1 },
    { trackingKeywordId: "kw_never", position: null },
  ]);
});

describe("runLiveCheck", () => {
  it("keeps going after a failed live batch", async () => {
    mocks.insertSnapshots.mockRejectedValueOnce(new Error("step timed out"));

    await runLiveCheck(
      step,
      checkContext(Array.from({ length: 11 }, (_, i) => `kw_${i}`)),
    );

    expect(mocks.rankCheckBatch).toHaveBeenCalledTimes(2);
  });
});

describe("retryRankChecks", () => {
  it("retries a check that errored through the queue, keeping a not found for a keyword that never ranked", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    queuedResults(null);

    await retryRankChecks(step, checkContext(["kw_never"]), "config_1");

    expect(mocks.rankCheckBatch).not.toHaveBeenCalled();
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledOnce();
    expect(mocks.upsertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        trackingKeywordId: "kw_never",
        position: null,
      }),
    ]);
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("retries a keyword that lost its known rank and keeps the best position found", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      snapshot("kw_0", null),
      snapshot("kw_never", null),
    ]);
    queuedResults(15, 20);

    await retryRankChecks(step, checkContext(["kw_0", "kw_never"]), "config_1");

    // 15 is still far below #1, so it gets the second retry too.
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [expect.objectContaining({ keywordId: "kw_0" })],
      }),
    );
    expect(mocks.upsertSnapshots).toHaveBeenCalledOnce();
    expect(mocks.upsertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ trackingKeywordId: "kw_0", position: 15 }),
    ]);
  });

  it("retries a device's miss once a retry finds the keyword on the other device", async () => {
    // Desktop missed on the first check and mobile errored.
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_never", null)]);
    // Retry 1 answers mobile at #3; retry 2 answers desktop.
    queuedResults(3, null);

    await retryRankChecks(
      step,
      { ...checkContext(["kw_never"]), devices: "both" },
      "config_1",
    );

    expect(mocks.rankCheckTaskPost).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tasks: [expect.objectContaining({ device: "desktop" })],
      }),
    );
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledWith([
      { runId: "run_1", trackingKeywordId: "kw_never", device: "desktop" },
    ]);
  });

  it("finds a new keyword on its second recheck after the first recheck misses", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_new", null)]);
    queuedResults(null, 3);

    await retryRankChecks(step, checkContext(["kw_new"]), "config_1");

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ trackingKeywordId: "kw_new", position: 3 }),
    ]);
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("never saves a not found for a keyword that ranked before", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);
    queuedResults(null, null);

    await retryRankChecks(step, checkContext(["kw_0"]), "config_1");

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSnapshots).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });
});
