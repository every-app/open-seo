import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";
import { runLiveCheck } from "./rankCheckPaths";

const mocks = vi.hoisted(() => ({
  rankCheckBatch: vi.fn(),
  insertSnapshots: vi.fn(),
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
