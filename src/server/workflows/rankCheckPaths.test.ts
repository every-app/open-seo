import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import { retryRankChecks } from "./rankCheckRetries";

const mocks = vi.hoisted(() => ({
  getSnapshotsForRun: vi.fn(),
  getBestPositionsForKeywords: vi.fn(),
  upsertSnapshots: vi.fn(),
  deleteNotFoundSnapshots: vi.fn(),
  fetchRankCheckTaskResult: vi.fn(),
  rankCheckTaskPost:
    vi.fn<(input: { tasks: RankCheckTaskInput[] }) => Promise<unknown>>(),
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

function checkContext(
  keywordIds: string[],
  devices: "desktop" | "both" = "desktop",
) {
  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the check paths only call this serp method
    client: { serp: { rankCheckTaskPost: mocks.rankCheckTaskPost } } as never,
    keywords: keywordIds.map((id) => ({ id, keyword: `keyword ${id}` })),
    devices,
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

function retry(
  ctx: ReturnType<typeof checkContext>,
  readsEndAt = Infinity,
  firstReadStragglers: Array<RankCheckTaskInput & { taskId: string }> = [],
) {
  return retryRankChecks(
    step,
    ctx,
    "config_1",
    readsEndAt,
    firstReadStragglers,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.rankCheckTaskPost.mockImplementation(
    async ({ tasks }: { tasks: RankCheckTaskInput[] }) =>
      tasks.map((task) => ({ ...task, taskId: `task_${task.keywordId}` })),
  );
  mocks.fetchRankCheckTaskResult.mockImplementation(
    async (task: RankCheckTaskInput) => ({
      status: "completed",
      result: { ...task, position: null, url: null, serpFeatures: [] },
    }),
  );
  mocks.getBestPositionsForKeywords.mockResolvedValue([
    { trackingKeywordId: "kw_0", position: 1 },
    { trackingKeywordId: "kw_never", position: null },
  ]);
});

describe("retryRankChecks", () => {
  it("reads a keyword its first read found only once", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", 5)]);

    await retry(checkContext(["kw_0"]));

    expect(mocks.rankCheckTaskPost).not.toHaveBeenCalled();
  });

  it("reads a miss once more when the keyword ranked before, keeping what that read finds", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);
    queuedResults(3);

    await retry(checkContext(["kw_0"]));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(1);
    expect(mocks.upsertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ trackingKeywordId: "kw_0", position: 3 }),
    ]);
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("doesn't read a miss again when the keyword never ranked", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_never", null)]);

    await retry(checkContext(["kw_never"]));

    expect(mocks.rankCheckTaskPost).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("reads a pair whose first read got no page, and saves its not found", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([]);

    await retry(checkContext(["kw_never"]));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(1);
    expect(mocks.upsertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        trackingKeywordId: "kw_never",
        position: null,
      }),
    ]);
  });

  it("never saves a not found for a keyword that ranked before", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);

    await retry(checkContext(["kw_0"]));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(1);
    expect(mocks.upsertSnapshots).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledExactlyOnceWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });

  it("reads a device's miss again and drops it when the keyword ranks on the other device", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      snapshot("kw_never", null),
      { ...snapshot("kw_never", 3), device: "mobile" },
    ]);

    await retry(checkContext(["kw_never"], "both"));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tasks: [expect.objectContaining({ device: "desktop" })],
      }),
    );
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledExactlyOnceWith([
      { runId: "run_1", trackingKeywordId: "kw_never", device: "desktop" },
    ]);
  });

  it("starts no second read once the read window has passed, and still drops misses", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);

    await retry(checkContext(["kw_0"]), Date.now() - 1);

    expect(mocks.rankCheckTaskPost).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledExactlyOnceWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });

  it("gives a first-read straggler its second read once its task is collected", async () => {
    // kw_never's first read errored; kw_0's is still queued.
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    const straggler = {
      keyword: "keyword kw_0",
      keywordId: "kw_0",
      device: "desktop" as const,
      taskId: "task_first_kw_0",
    };

    await retry(checkContext(["kw_0", "kw_never"]), Infinity, [straggler]);

    const posted = mocks.rankCheckTaskPost.mock.calls.map(([{ tasks }]) =>
      tasks.map((task) => task.keywordId),
    );
    expect(posted).toEqual([["kw_never"], ["kw_0"]]);
  });

  it("polls every task of a large read in each round, 25 a second", async () => {
    // Every first read errored, so each pair gets a second.
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    vi.useFakeTimers();
    const startedAt = Date.now();

    const done = retry(
      checkContext(Array.from({ length: 600 }, (_, i) => `kw_${i + 1}`)),
    );
    await vi.runAllTimersAsync();
    await done;

    // 24 batches of 25, a second apart.
    expect(mocks.fetchRankCheckTaskResult).toHaveBeenCalledTimes(600);
    expect(Date.now() - startedAt).toBe(24_000);
    expect(vi.mocked(step.sleep).mock.calls).toEqual([
      ["read-2-wait-0", "4 minutes"],
    ]);
  });
});
