/* eslint-disable max-lines -- fork live-retry and validated-run cases beside upstream's queued retries */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import {
  fetchRankCheckTaskHtml,
  fetchRankCheckTaskResult,
} from "@/server/lib/dataforseo";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { runLiveCheck } from "./rankCheckPaths";
import { runQueuedCheck } from "./rankCheckQueuedPath";
import { retryRankChecks } from "./rankCheckRetries";

const mocks = vi.hoisted(() => ({
  rankCheckBatch: vi.fn(),
  rankCheckTaskPost: vi.fn(),
  insertSnapshots: vi.fn(),
  upsertSnapshots: vi.fn(),
  deleteNotFoundSnapshots: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  getBestPositionsForKeywords: vi.fn(),
  getRecentSnapshotsForConfig: vi.fn(),
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

const rankResult = (
  position: number | null,
  url: string | null = null,
  topDomains: string[] = [],
) => ({
  keywordId: "kw_0",
  keyword: "kw_0",
  position,
  url,
  serpFeatures: [],
  topDomains,
});

function checkContext(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the paths only call the two mocked serp methods
    client: {
      serp: {
        rankCheckBatch: mocks.rankCheckBatch,
        rankCheckTaskPost: mocks.rankCheckTaskPost,
      },
    } as unknown as CheckContext["client"],
    configId: "config_1",
    keywords: [{ id: "kw_0", keyword: "kw_0" }],
    devices: "mobile",
    serpDepth: 40,
    domain: "example.com",
    locationCode: 2840,
    languageCode: "en",
    runId: "run_1",
    ...overrides,
  };
}

const providerFailure = () =>
  new AppError("UPSTREAM_UNAVAILABLE", "Internal SE Server Error.");

// Named the way core.ts names a request that ran out its 60s budget.
function timeout() {
  const error = new AppError("UPSTREAM_UNAVAILABLE", "request timed out");
  error.name = "DataForSEOTimeoutError";
  return error;
}

const found = { status: "fulfilled", value: rankResult(1) };
const failed = (reason: unknown) => ({ status: "rejected", reason });

async function runLive(devices: CheckContext["devices"] = "mobile") {
  const ctx = checkContext({ devices });
  vi.useFakeTimers();
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- steps are executed directly by the pgStep mock
    const run = runLiveCheck({} as WorkflowStep, ctx);
    await vi.runAllTimersAsync();
    return await run;
  } finally {
    vi.useRealTimers();
  }
}

describe("live rank check retries", () => {
  beforeEach(() => {
    mocks.rankCheckBatch.mockResolvedValue([]);
    mocks.getSnapshotsForRun.mockResolvedValue([]);
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
    // The bare code, so the app shows its provider-unavailable copy.
    expect(mocks.setRunErrorIfEmpty).toHaveBeenCalledWith(
      "run_1",
      "UPSTREAM_UNAVAILABLE",
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
// Upstream's paths: the live check writes what it gets and leaves the rest to
// retryRankChecks, which rechecks an errored, lost, or (on a first or manual
// check) missed pair through the queue, keeping the best position found.
// ---------------------------------------------------------------------------

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only sleep is reached; pgStep is mocked
const retryStep = { sleep: vi.fn() } as unknown as WorkflowStep;

function retryContext(
  keywordIds: string[],
  devices: CheckContext["devices"] = "desktop",
) {
  return checkContext({
    keywords: keywordIds.map((id) => ({ id, keyword: `keyword ${id}` })),
    devices,
  });
}

function snapshot(keywordId: string, position: number | null) {
  return { trackingKeywordId: keywordId, device: "desktop", position };
}

/** Each task_get answers with the next position. */
function queuedResults(...positions: Array<number | null>) {
  for (const position of positions) {
    vi.mocked(fetchRankCheckTaskResult).mockImplementationOnce(
      async (task) => ({
        status: "completed",
        result: {
          ...task,
          position,
          url: null,
          serpFeatures: [],
          topDomains: [],
        },
      }),
    );
  }
}

describe("runLiveCheck", () => {
  it("keeps going after a failed live batch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.rankCheckBatch.mockImplementation(
      async (inputs: RankCheckTaskInput[]) =>
        inputs.map((input) => ({
          status: "fulfilled",
          value: {
            ...input,
            position: 3,
            url: null,
            serpFeatures: [],
            topDomains: [],
          },
        })),
    );
    mocks.insertSnapshots.mockRejectedValueOnce(new Error("step timed out"));

    await runLiveCheck(
      retryStep,
      retryContext(Array.from({ length: 11 }, (_, i) => `kw_${i}`)),
    );

    expect(mocks.rankCheckBatch).toHaveBeenCalledTimes(2);
  });
});

describe("retryRankChecks", () => {
  beforeEach(() => {
    mocks.rankCheckTaskPost.mockImplementation(
      async ({ tasks }: { tasks: RankCheckTaskInput[] }) =>
        tasks.map((task) => ({ ...task, taskId: `task_${task.keywordId}` })),
    );
    vi.mocked(fetchRankCheckTaskResult).mockImplementation(async (task) => ({
      status: "completed",
      result: {
        ...task,
        position: 5,
        url: null,
        serpFeatures: [],
        topDomains: [],
      },
    }));
    mocks.getBestPositionsForKeywords.mockResolvedValue([
      { trackingKeywordId: "kw_0", position: 1 },
      { trackingKeywordId: "kw_never", position: null },
    ]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("retries a check that errored through the queue, keeping a not found for a keyword that never ranked", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    queuedResults(null);

    await retryRankChecks(
      retryStep,
      retryContext(["kw_never"]),
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
      retryStep,
      retryContext(["kw_0", "kw_never"]),
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
      retryStep,
      retryContext(["kw_never"], "both"),
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
      retryStep,
      retryContext(["kw_new"]),
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
      retryStep,
      retryContext(["kw_never"]),
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
      retryStep,
      retryContext(["kw_0"]),
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

// ---------------------------------------------------------------------------
// Validated queued checks: a result counts only if the page that produced it
// shows Google applied the location. One keyword, one device, so every
// task_post carries exactly one task and every poll round collects it.
// ---------------------------------------------------------------------------

// Real markup captured from DataForSEO task_get/html on 2026-10-12: the
// location module of a page Google served without the requested location, and
// the location chip of a page where it applied the location.
const DROPPED_PAGE =
  '<geolocation class="vr0Skf edCDP sjVJQd" accuracymode="precise"><span class="O6Aqz" jsslot=""><div class="kGoFr TaBIX n1yRGd btku5b FR7ZSc k1U36b" role="button" tabindex="0"><div class="niO4u VDgVie SlP8xc"><span class="d3o3Ad TwMgNb z1asCe" style="height:18px;line-height:18px;width:18px"><svg></svg></span><div class="sjVJQd">Use precise location</div></div></div></span></geolocation>';
const LOCALIZED_PAGE =
  '</path><circle cx="12" cy="9" r="2.5"></circle></svg></span></span></span><span><span class="V8fWH"><div></div></span><span class="BBwThe">Ellensburg, WA</span></span></div><div class="eakexd EpKMFb"><span class="JIFdL" aria-hidden="true">&nbsp;&#8729; </span><a class="N5az4b" href="#" role="button" tabindex="0"><span class="nh8Ece">Choose area</span></a><span id="tsuid_s2PNatOMLvKJ9u8PvtOYyQs_27"><div jsaction="yL';
const ready = (...pages: string[]) => ({ status: "ready" as const, pages });

const completedAt = (
  position: number | null,
  url: string | null = null,
  topDomains: string[] = [],
) => ({
  status: "completed" as const,
  result: rankResult(position, url, topDomains),
});
const historyRow = (
  position: number | null,
  url: string | null,
  topDomains: string[] | null = null,
) => ({
  trackingKeywordId: "kw_0",
  device: "mobile",
  position,
  url,
  topDomains: topDomains ? JSON.stringify(topDomains) : null,
});

async function runQueued(validateSerps = true) {
  const ctx = checkContext({ locationCode: 1027577, validateSerps });
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
    mocks.getRecentSnapshotsForConfig.mockResolvedValue([]);
    vi.mocked(fetchRankCheckTaskResult).mockResolvedValue(completedAt(1));
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValue(ready(LOCALIZED_PAGE));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("crawls a dropped-location reading again and stores the clean page", async () => {
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValueOnce(
      ready(DROPPED_PAGE),
    );
    vi.mocked(fetchRankCheckTaskResult)
      .mockResolvedValueOnce(completedAt(18))
      .mockResolvedValueOnce(completedAt(2));

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.insertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ position: 2, device: "mobile" }),
    ]);
    expect(stats).toMatchObject({
      locationDropped: 1,
      reposted: 1,
      validated: 1,
      withheld: 0,
    });
    expect(mocks.setRunErrorIfEmpty).not.toHaveBeenCalled();
  });

  it("holds a reading whose page never shows the location", async () => {
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValue(ready(DROPPED_PAGE));

    const stats = await runQueued();

    // One crawl plus three more, then the keyword keeps its previous position;
    // finalize writes the held count into the run from these stats.
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(4);
    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(mocks.setRunErrorIfEmpty).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ withheld: 1, undelivered: 0 });
  });

  it("holds an undelivered reading instead of live-checking it", async () => {
    vi.mocked(fetchRankCheckTaskResult).mockResolvedValue({
      status: "pending",
    });

    const stats = await runQueued();

    expect(mocks.rankCheckBatch).not.toHaveBeenCalled();
    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ undelivered: 1, fallbackTasks: 0 });
  });

  it("reads an unreadable page again next round and holds it when the window closes", async () => {
    vi.mocked(fetchRankCheckTaskHtml).mockRejectedValue(new Error("gone"));

    const stats = await runQueued();

    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(1);
    expect(stats.htmlUnavailable).toBeGreaterThan(1);
    expect(stats).toMatchObject({ undelivered: 1, withheld: 0 });
  });

  it("writes a no-results page as checked", async () => {
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValue(ready());

    const stats = await runQueued();

    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ validated: 1, withheld: 0 });
  });

  // The page looks precise, so only the pair's own history can catch it.
  it("recrawls a reading that falls off the pair's recent history and stores the one that fits", async () => {
    mocks.getRecentSnapshotsForConfig.mockResolvedValue([
      {
        trackingKeywordId: "kw_0",
        device: "mobile",
        position: 1,
        url: "https://www.example.com/",
      },
    ]);
    vi.mocked(fetchRankCheckTaskResult)
      .mockResolvedValueOnce(completedAt(null))
      .mockResolvedValueOnce(completedAt(2, "https://www.example.com/"));

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.insertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ position: 2 }),
    ]);
    expect(stats).toMatchObject({
      historySuspect: 1,
      reposted: 1,
      withheld: 0,
    });
  });

  it("holds a different page ranking below the pair's usual one", async () => {
    mocks.getRecentSnapshotsForConfig.mockResolvedValue([
      {
        trackingKeywordId: "kw_0",
        device: "mobile",
        position: 1,
        url: "https://www.example.com/",
      },
    ]);
    vi.mocked(fetchRankCheckTaskResult).mockResolvedValue(
      completedAt(2, "https://www.example.com/small-business-lawyer"),
    );

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(4);
    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ historySuspect: 4, withheld: 1 });
  });

  // The target never ranks here, so only the page's composition can tell a
  // national page from the keyword's own page.
  it("recrawls a page that keeps fewer than half of the pair's usual sites", async () => {
    const usual = ["a.com", "b.com", "c.com", "d.com"];
    mocks.getRecentSnapshotsForConfig.mockResolvedValue([
      historyRow(null, null, usual),
      historyRow(null, null, ["a.com", "b.com", "c.com", "d.com", "e.com"]),
    ]);
    vi.mocked(fetchRankCheckTaskResult)
      .mockResolvedValueOnce(
        completedAt(null, null, ["x.com", "y.com", "a.com"]),
      )
      .mockResolvedValueOnce(
        completedAt(null, null, ["a.com", "b.com", "c.com"]),
      );

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.insertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        topDomains: JSON.stringify(["a.com", "b.com", "c.com"]),
      }),
    ]);
    expect(stats).toMatchObject({ historySuspect: 1, withheld: 0 });
  });

  it("does not judge composition from a single stored page", async () => {
    mocks.getRecentSnapshotsForConfig.mockResolvedValue([
      historyRow(null, null, ["a.com", "b.com", "c.com", "d.com"]),
    ]);
    vi.mocked(fetchRankCheckTaskResult).mockResolvedValue(
      completedAt(null, null, ["x.com", "y.com", "z.com"]),
    );

    const stats = await runQueued();

    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ historySuspect: 0 });
  });

  it("accepts an unranked reading for a pair with no ranked history", async () => {
    vi.mocked(fetchRankCheckTaskResult).mockResolvedValue(completedAt(null));

    const stats = await runQueued();

    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ historySuspect: 0, validated: 1 });
  });

  // The first page arrives in the last round that can still repost (~15
  // minutes in), and the new crawl takes three more rounds; the window still
  // collects it instead of holding the pair.
  it("recrawls a dropped page that arrives late in the window", async () => {
    vi.mocked(fetchRankCheckTaskResult)
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce(completedAt(18))
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" });
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValueOnce(
      ready(DROPPED_PAGE),
    );

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.insertSnapshots).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ position: 1 }),
    ]);
    expect(stats).toMatchObject({ reposted: 1, withheld: 0 });
  });

  it("stops reposting once the window can no longer collect a new crawl", async () => {
    vi.mocked(fetchRankCheckTaskResult)
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce(completedAt(1));
    vi.mocked(fetchRankCheckTaskHtml).mockResolvedValue(ready(DROPPED_PAGE));

    const stats = await runQueued();

    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ withheld: 1, reposted: 0 });
  });

  it("does not read pages on a plain queued check", async () => {
    await runQueued(false);

    expect(fetchRankCheckTaskHtml).not.toHaveBeenCalled();
    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
  });
});
