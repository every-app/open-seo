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

function retry(ctx: ReturnType<typeof checkContext>, readsEndAt = Infinity) {
  return retryRankChecks(step, ctx, "config_1", readsEndAt);
}

/** A read of more than 25 tasks spaces its task_get batches a second apart. */
async function retryPaced(ctx: ReturnType<typeof checkContext>) {
  vi.useFakeTimers();
  const startedAt = Date.now();
  const done = retry(ctx);
  await vi.runAllTimersAsync();
  await done;
  return { elapsedMs: Date.now() - startedAt };
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
  it("gives a keyword three reads even when the first looks fine, then stops once they agree", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_new", 5)]);
    queuedResults(4, 6);

    await retry(checkContext(["kw_new"]));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ trackingKeywordId: "kw_new", position: 4 }),
    ]);
  });

  it.each([
    ["positions differ by more than two places", [3, 9, 8, 7, 6]],
    ["a read misses the site", [null, 3, 5, 5, 5]],
  ])(
    "reads up to six times when %s, keeping the best position",
    async (_label, laterReads) => {
      mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_new", 5)]);
      queuedResults(...laterReads);

      await retry(checkContext(["kw_new"]));

      expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(5);
      expect(mocks.upsertSnapshots).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ position: 3 }),
      ]);
    },
  );

  it("polls every task of a large read in each round, 25 a second", async () => {
    const keywordIds = Array.from({ length: 600 }, (_, i) => `kw_${i + 1}`);
    mocks.getSnapshotsForRun.mockResolvedValue(
      keywordIds.map((id) => snapshot(id, 5)),
    );
    mocks.fetchRankCheckTaskResult.mockImplementation(
      async (task: RankCheckTaskInput) => ({
        status: "completed",
        result: { ...task, position: 5, url: null, serpFeatures: [] },
      }),
    );

    const { elapsedMs } = await retryPaced(checkContext(keywordIds));

    // Reads two and three: one round each, 24 batches of 25, a second apart.
    expect(mocks.fetchRankCheckTaskResult).toHaveBeenCalledTimes(1200);
    expect(elapsedMs).toBe(48_000);
    expect(vi.mocked(step.sleep).mock.calls).toEqual([
      ["read-2-wait-0", "4 minutes"],
      ["read-3-wait-0", "4 minutes"],
    ]);
  });

  it("starts the next read without a task still in the queue, and reads that keyword once its task is done", async () => {
    const keywordIds = Array.from({ length: 100 }, (_, i) => `kw_${i + 1}`);
    mocks.getSnapshotsForRun.mockResolvedValue(
      keywordIds.map((id) => snapshot(id, 5)),
    );
    // kw_100's second read stays queued through that read's first poll.
    let slowPolls = 0;
    mocks.fetchRankCheckTaskResult.mockImplementation(
      async (task: RankCheckTaskInput) =>
        task.keywordId === "kw_100" && slowPolls++ === 0
          ? { status: "pending" }
          : {
              status: "completed",
              result: { ...task, position: 5, url: null, serpFeatures: [] },
            },
    );

    await retryPaced(checkContext(keywordIds));

    const posted = mocks.rankCheckTaskPost.mock.calls.map(([{ tasks }]) =>
      tasks.map((task) => task.keywordId),
    );
    // Read three goes out for the other 99 while kw_100's task is collected
    // alongside it; kw_100 then gets its third read on its own.
    expect(posted.map((tasks) => tasks.length)).toEqual([100, 99, 1]);
    expect(posted[2]).toEqual(["kw_100"]);
    expect(vi.mocked(step.sleep).mock.calls).toEqual([
      ["read-2-wait-0", "4 minutes"],
      ["read-3-wait-0", "4 minutes"],
      ["read-4-wait-0", "4 minutes"],
    ]);
  });

  it("just past the read window, still gives a keyword its three reads but none after", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_new", 5)]);
    // Positions that disagree would get more reads inside the window.
    queuedResults(9, 1);

    await retry(checkContext(["kw_new"]), Date.now() - 1);

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
  });

  it("starts no more reads once the read window is well past, and still drops misses", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);

    await retry(checkContext(["kw_0"]), Date.now() - 16 * 60_000);

    expect(mocks.rankCheckTaskPost).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledExactlyOnceWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });

  it("saves a not found for a keyword that never ranked once a read answers", async () => {
    // The first read errored, so there is no row yet.
    mocks.getSnapshotsForRun.mockResolvedValue([]);

    await retry(checkContext(["kw_never"]));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(5);
    expect(mocks.upsertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        trackingKeywordId: "kw_never",
        position: null,
      }),
    ]);
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("finds a new keyword on a later read after earlier ones miss", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_new", null)]);
    queuedResults(null, null, null, 3, null);

    await retry(checkContext(["kw_new"]));

    expect(mocks.upsertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ trackingKeywordId: "kw_new", position: 3 }),
    ]);
    expect(mocks.deleteNotFoundSnapshots).not.toHaveBeenCalled();
  });

  it("never saves a not found for a keyword that ranked before", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([snapshot("kw_0", null)]);

    await retry(checkContext(["kw_0"]));

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(5);
    expect(mocks.upsertSnapshots).not.toHaveBeenCalled();
    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledExactlyOnceWith([
      { runId: "run_1", trackingKeywordId: "kw_0", device: "desktop" },
    ]);
  });

  it("drops a device's miss when the keyword ranks on the other device in this run", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      snapshot("kw_never", null),
      { ...snapshot("kw_never", 3), device: "mobile" },
    ]);

    await retry(checkContext(["kw_never"], "both"));

    expect(mocks.deleteNotFoundSnapshots).toHaveBeenCalledExactlyOnceWith([
      { runId: "run_1", trackingKeywordId: "kw_never", device: "desktop" },
    ]);
  });
});
