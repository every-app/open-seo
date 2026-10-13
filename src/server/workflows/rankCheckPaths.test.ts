import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import { SUBREQUEST_LIMIT_ERROR } from "@/shared/rank-tracking";
import { runLiveCheck, runQueuedCheck } from "./rankCheckPaths";
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

function manyKeywordIds(count: number) {
  return Array.from({ length: count }, (_, i) => `kw_${i}`);
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

describe("at the platform subrequest limit", () => {
  const limitError = new Error(
    "Too many subrequests by single Worker invocation.",
  );

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stops a queued check without polling again, keeping what it collected", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    // The budget runs out partway through the second task_get chunk.
    let budget = 30;
    mocks.fetchRankCheckTaskResult.mockImplementation(
      async (task: RankCheckTaskInput) => {
        if (budget-- <= 0) throw limitError;
        return {
          status: "completed",
          result: { ...task, position: 5, url: null, serpFeatures: [] },
        };
      },
    );

    const limited = await runQueuedCheck(
      step,
      checkContext(manyKeywordIds(80)),
    );

    expect(limited).toBe(true);
    // Two chunks of 25, then no third chunk and no second round.
    expect(mocks.fetchRankCheckTaskResult).toHaveBeenCalledTimes(50);
    expect(step.sleep).toHaveBeenCalledOnce();
    expect(mocks.insertSnapshots.mock.calls[0][0]).toHaveLength(30);
    expect(mocks.updateRun).toHaveBeenCalledWith("run_1", {
      errorMessage: SUBREQUEST_LIMIT_ERROR,
    });
  });

  it("stops a live check after the batch that hit the limit, keeping its results", async () => {
    mocks.rankCheckBatch.mockImplementation(
      async (inputs: RankCheckTaskInput[]) =>
        inputs.map((input, index) =>
          index < 4
            ? {
                status: "fulfilled",
                value: { ...input, position: 3, url: null, serpFeatures: [] },
              }
            : { status: "rejected", reason: limitError },
        ),
    );

    const limited = await runLiveCheck(step, checkContext(manyKeywordIds(30)));

    expect(limited).toBe(true);
    expect(mocks.rankCheckBatch).toHaveBeenCalledOnce();
    expect(mocks.insertSnapshots.mock.calls[0][0]).toHaveLength(4);
    expect(mocks.updateRun).toHaveBeenCalledWith("run_1", {
      errorMessage: SUBREQUEST_LIMIT_ERROR,
    });
  });

  it("posts no retries after the check hit the limit, but still drops unconfirmed misses", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);

    await retryRankChecks(
      step,
      checkContext(["kw_0"]),
      "config_1",
      "scheduled",
      true,
    );

    expect(mocks.rankCheckTaskPost).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });

  it("stops retrying once a retry round hits the limit", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);
    mocks.fetchRankCheckTaskResult.mockRejectedValue(limitError);

    await retryRankChecks(
      step,
      checkContext(["kw_0"]),
      "config_1",
      "scheduled",
    );

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledOnce();
    expect(mocks.updateRun).toHaveBeenCalledWith("run_1", {
      errorMessage: SUBREQUEST_LIMIT_ERROR,
    });
  });
});

describe("retryRankChecks", () => {
  it("retries a check that errored through the queue, keeping a not found for a keyword that never ranked", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    queuedResults(null);

    await retryRankChecks(
      step,
      checkContext(["kw_never"]),
      "config_1",
      "scheduled",
    );

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

    await retryRankChecks(
      step,
      checkContext(["kw_0", "kw_never"]),
      "config_1",
      "scheduled",
    );

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
      "scheduled",
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

    await retryRankChecks(
      step,
      checkContext(["kw_new"]),
      "config_1",
      "scheduled",
    );

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ trackingKeywordId: "kw_new", position: 3 }),
    ]);
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("rechecks a miss on a keyword that never ranked when the check is manual", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_never", null)]);
    queuedResults(null, 4);

    await retryRankChecks(
      step,
      checkContext(["kw_never"]),
      "config_1",
      "manual",
    );

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ trackingKeywordId: "kw_never", position: 4 }),
    ]);
  });

  it("never saves a not found for a keyword that ranked before", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);
    queuedResults(null, null);

    await retryRankChecks(
      step,
      checkContext(["kw_0"]),
      "config_1",
      "scheduled",
    );

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSnapshots).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });
});
