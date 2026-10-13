import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import {
  fetchRankCheckTaskHtml,
  fetchRankCheckTaskResult,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { runLiveCheck } from "./rankCheckPaths";
import { runQueuedCheck } from "./rankCheckQueuedPath";

const mocks = vi.hoisted(() => ({
  rankCheckBatch: vi.fn(),
  rankCheckTaskPost: vi.fn(),
  insertSnapshots: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  setRunErrorIfEmpty: vi.fn(),
  updateRun: vi.fn(),
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/workflows/pgStep", () => ({
  pgStep: (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => fn(),
}));
// The real module loads the metered client, which needs cloudflare:workers.
vi.mock("@/server/lib/dataforseo", () => ({
  fetchRankCheckTaskHtml: vi.fn(),
  fetchRankCheckTaskResult: vi.fn(),
  MAX_TASKS_PER_POST: 100,
}));

type CheckContext = Parameters<typeof runLiveCheck>[1];

const providerFailure = () =>
  new AppError("UPSTREAM_UNAVAILABLE", "Internal SE Server Error.");

// Named the way core.ts names a request that ran out its 60s budget.
function timeout() {
  const error = new AppError("UPSTREAM_UNAVAILABLE", "request timed out");
  error.name = "DataForSEOTimeoutError";
  return error;
}

const found = {
  status: "fulfilled",
  value: {
    keywordId: "kw_0",
    keyword: "kw_0",
    position: 1,
    url: null,
    serpFeatures: [],
  },
};
const failed = (reason: unknown) => ({ status: "rejected", reason });

async function runLive(devices: CheckContext["devices"] = "mobile") {
  const ctx: CheckContext = {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the live path only calls serp.rankCheckBatch
    client: {
      serp: { rankCheckBatch: mocks.rankCheckBatch },
    } as unknown as CheckContext["client"],
    keywords: [{ id: "kw_0", keyword: "kw_0" }],
    devices,
    serpDepth: 40,
    domain: "example.com",
    locationCode: 2840,
    languageCode: "en",
    runId: "run_1",
  };
  vi.useFakeTimers();
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- steps are executed directly by the pgStep mock
    const run = runLiveCheck({} as WorkflowStep, ctx);
    await vi.runAllTimersAsync();
    await run;
  } finally {
    vi.useRealTimers();
  }
}

describe("live rank check retries", () => {
  beforeEach(() => {
    mocks.rankCheckBatch.mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // The recovered snapshot must keep its own device: one written under the
  // other pair's device would be dropped as a duplicate of that pair's row.
  it("retries only the pair DataForSEO failed and keeps both snapshots", async () => {
    mocks.rankCheckBatch
      .mockResolvedValueOnce([found, failed(providerFailure())])
      .mockResolvedValueOnce([found]);

    await runLive("both");

    expect(mocks.rankCheckBatch).toHaveBeenLastCalledWith([
      expect.objectContaining({ device: "mobile" }),
    ]);
    expect(mocks.insertSnapshots.mock.calls).toEqual([
      [[expect.objectContaining({ device: "desktop" })]],
      [[expect.objectContaining({ device: "mobile" })]],
    ]);
    expect(mocks.setRunErrorIfEmpty).not.toHaveBeenCalled();
  });

  it("gives up after two retries and records the provider's reason", async () => {
    for (let n = 0; n < 3; n++)
      mocks.rankCheckBatch.mockResolvedValueOnce([failed(providerFailure())]);

    await runLive();

    expect(mocks.rankCheckBatch).toHaveBeenCalledTimes(3);
    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(mocks.setRunErrorIfEmpty).toHaveBeenCalledWith(
      "run_1",
      "Internal SE Server Error.",
    );
  });

  // A timeout may already be billed, an error on our side will not clear by
  // itself, and a failed credit hold means no call ran at all.
  it.each([
    [
      "a timeout",
      () => mocks.rankCheckBatch.mockResolvedValueOnce([failed(timeout())]),
    ],
    [
      "a failure on our side",
      () =>
        mocks.rankCheckBatch.mockResolvedValueOnce([
          failed(new AppError("INSUFFICIENT_CREDITS")),
        ]),
    ],
    [
      "a failed credit hold",
      () => mocks.rankCheckBatch.mockRejectedValueOnce(providerFailure()),
    ],
  ])("does not replay %s", async (_label, arrange) => {
    arrange();

    await runLive();

    expect(mocks.rankCheckBatch).toHaveBeenCalledOnce();
    expect(mocks.setRunErrorIfEmpty).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Validated queued checks: a result counts only if the page that produced it
// shows Google applied the location. One keyword, one device, so every
// task_post carries exactly one task and every poll round collects it.
// ---------------------------------------------------------------------------

const DROPPED_PAGE = "<div>Ellensburg, WA Use precise location</div>";
const LOCALIZED_PAGE = "<div>Ellensburg, WA Choose area</div>";

const completedAt = (position: number) => ({
  status: "completed" as const,
  result: {
    keywordId: "kw_0",
    keyword: "kw_0",
    position,
    url: null,
    serpFeatures: [],
  },
});

async function runQueued(validateSerps = true) {
  const ctx: Parameters<typeof runQueuedCheck>[1] = {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the queued path posts tasks and collects them through the mocked module
    client: {
      serp: { rankCheckTaskPost: mocks.rankCheckTaskPost },
    } as unknown as Parameters<typeof runQueuedCheck>[1]["client"],
    keywords: [{ id: "kw_0", keyword: "kw_0" }],
    devices: "mobile",
    serpDepth: 40,
    domain: "example.com",
    locationCode: 1027577,
    languageCode: "en",
    runId: "run_1",
    validateSerps,
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- steps run directly through the pgStep mock; only sleep is called
  const step = { sleep: vi.fn() } as unknown as WorkflowStep;
  return runQueuedCheck(step, ctx);
}

describe("validated queued rank checks", () => {
  beforeEach(() => {
    // Each post hands back one new task id, so a reposted pair gets a new crawl.
    let nextTask = 0;
    mocks.rankCheckTaskPost.mockImplementation(
      async ({ tasks }: { tasks: Array<Record<string, unknown>> }) =>
        tasks.map((task) => ({ ...task, taskId: `task_${++nextTask}` })),
    );
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    vi.mocked(fetchRankCheckTaskResult).mockResolvedValue(completedAt(1));
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValue(LOCALIZED_PAGE);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("crawls a dropped-location reading again and stores the clean page", async () => {
    vi.mocked(fetchRankCheckTaskHtml)
      .mockResolvedValueOnce(DROPPED_PAGE)
      .mockResolvedValueOnce(LOCALIZED_PAGE);
    vi.mocked(fetchRankCheckTaskResult)
      .mockResolvedValueOnce(completedAt(18))
      .mockResolvedValueOnce(completedAt(2));

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.insertSnapshots.mock.calls).toEqual([
      [[expect.objectContaining({ position: 2, device: "mobile" })]],
    ]);
    expect(stats).toMatchObject({
      locationDropped: 1,
      reposted: 1,
      validated: 1,
      withheld: 0,
    });
    expect(mocks.setRunErrorIfEmpty).not.toHaveBeenCalled();
  });

  it("withholds a reading whose page never shows the location", async () => {
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValue(DROPPED_PAGE);

    const stats = await runQueued();

    // One crawl plus three more, then the keyword keeps its previous position.
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(4);
    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(mocks.setRunErrorIfEmpty).toHaveBeenCalledWith(
      "run_1",
      expect.stringMatching(/^Withheld 1 reading\(s\)/),
    );
    expect(stats).toMatchObject({ withheld: 1, fallbackTasks: 0 });
  });

  it("keeps a reading whose page cannot be read", async () => {
    vi.mocked(fetchRankCheckTaskHtml).mockRejectedValue(new Error("gone"));

    const stats = await runQueued();

    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ htmlUnavailable: 1, withheld: 0 });
  });

  it("does not read pages on a plain queued check", async () => {
    await runQueued(false);

    expect(fetchRankCheckTaskHtml).not.toHaveBeenCalled();
    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
  });
});
