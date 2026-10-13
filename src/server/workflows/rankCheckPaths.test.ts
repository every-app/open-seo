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

const rankResult = (position: number | null) => ({
  keywordId: "kw_0",
  keyword: "kw_0",
  position,
  url: null,
  serpFeatures: [],
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

// Real markup captured from DataForSEO task_get/html on 2026-10-12: the
// location module of a page Google served without the requested location, and
// the location chip of a page where it applied the location.
const DROPPED_PAGE =
  '<geolocation class="vr0Skf edCDP sjVJQd" accuracymode="precise"><span class="O6Aqz" jsslot=""><div class="kGoFr TaBIX n1yRGd btku5b FR7ZSc k1U36b" role="button" tabindex="0"><div class="niO4u VDgVie SlP8xc"><span class="d3o3Ad TwMgNb z1asCe" style="height:18px;line-height:18px;width:18px"><svg></svg></span><div class="sjVJQd">Use precise location</div></div></div></span></geolocation>';
const LOCALIZED_PAGE =
  '</path><circle cx="12" cy="9" r="2.5"></circle></svg></span></span></span><span><span class="V8fWH"><div></div></span><span class="BBwThe">Ellensburg, WA</span></span></div><div class="eakexd EpKMFb"><span class="JIFdL" aria-hidden="true">&nbsp;&#8729; </span><a class="N5az4b" href="#" role="button" tabindex="0"><span class="nh8Ece">Choose area</span></a><span id="tsuid_s2PNatOMLvKJ9u8PvtOYyQs_27"><div jsaction="yL';
const ready = (...pages: string[]) => ({ status: "ready" as const, pages });

const completedAt = (position: number) => ({
  status: "completed" as const,
  result: rankResult(position),
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

  it("stops reposting once the window can no longer collect a new crawl", async () => {
    vi.mocked(fetchRankCheckTaskResult)
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
