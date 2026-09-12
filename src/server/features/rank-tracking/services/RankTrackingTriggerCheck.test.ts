import { beforeEach, describe, expect, it, vi } from "vitest";

// Scope enforcement for manual rank-check triggers: the selected keyword IDs
// are the exact scope handed to the run — validated against the config's own
// keywords, deduplicated, and never expanded to the full tracked set.

interface KeywordRow {
  id: string;
  configId: string;
  keyword: string;
}

interface RunStartCall {
  keywordsTotal: number;
  keywordIds?: string[];
  trigger: "manual" | "scheduled";
  config: unknown;
  projectId: string;
  billingCustomer: unknown;
}

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn<
    (configId: string) => Promise<KeywordRow[]>
  >(),
  route: vi.fn(),
}));

const guardMocks = vi.hoisted(() => ({
  beginRankCheckRun: vi.fn<
    (input: RunStartCall) => Promise<{ ok: true; runId: string }>
  >(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => ({ route: mocks.route }),
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigById: mocks.getConfigById,
      getKeywordsForConfig: mocks.getKeywordsForConfig,
    },
  }),
);
vi.mock("./rankCheckRunGuards", () => ({
  beginRankCheckRun: guardMocks.beginRankCheckRun,
  reconcileActiveRankCheckRun: vi.fn(),
}));

const activeConfig = {
  id: "config_1",
  projectId: "project_1",
  domain: "acme.com",
  locationCode: 2840,
  languageCode: "en",
  locationName: null,
  devices: "both" as const,
  serpDepth: 20,
  scheduleInterval: "weekly" as const,
  isActive: true,
};

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

function makeKeywords(count: number): KeywordRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `keyword_${i + 1}`,
    configId: "config_1",
    keyword: `tracked query ${i + 1}`,
  }));
}

function runStartCall(index = 0): RunStartCall {
  const calls = guardMocks.beginRankCheckRun.mock.calls;
  return calls[index]?.[0];
}

async function triggerSelected(keywordIds?: string[]) {
  const { RankTrackingService } = await import("./RankTrackingService");
  return RankTrackingService.triggerCheck({
    configId: "config_1",
    projectId: "project_1",
    billingCustomer,
    keywordIds,
  });
}

describe("RankTrackingService.triggerCheck scope", { timeout: 20000 }, () => {
  beforeEach(() => {
    mocks.getConfigById.mockReset();
    mocks.getKeywordsForConfig.mockReset();
    guardMocks.beginRankCheckRun.mockReset();

    mocks.getConfigById.mockResolvedValue(activeConfig);
    guardMocks.beginRankCheckRun.mockResolvedValue({
      ok: true,
      runId: "run_1",
    });
  });

  it("passes the full keyword count when keywordIds is omitted (check-all unchanged)", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(3));

    await triggerSelected();

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordsTotal: 3,
        keywordIds: undefined,
      }),
    );
  });

  it("treats an empty keywordIds array as a full check, not a zero-scope run", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(3));

    await triggerSelected([]);

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordsTotal: 3,
        keywordIds: undefined,
      }),
    );
  });

  it("REGRESSION: 901 tracked keywords, 4 selected — the run receives exactly 4 ids", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(901));
    const selected = ["keyword_1", "keyword_2", "keyword_3", "keyword_4"];

    await triggerSelected(selected);

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    const call = runStartCall();
    expect(call.keywordsTotal).toBe(4);
    expect(call.keywordIds).toEqual(selected);
    expect(call.keywordIds).toHaveLength(4);
  });

  it("sends exactly one id when a single keyword is selected", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(5));

    await triggerSelected(["keyword_5"]);

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordsTotal: 1,
        keywordIds: ["keyword_5"],
      }),
    );
  });

  it("deduplicates repeated selected ids", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(4));

    await triggerSelected(["keyword_1", "keyword_2", "keyword_1", "keyword_2"]);

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordsTotal: 2,
        keywordIds: ["keyword_1", "keyword_2"],
      }),
    );
  });

  it("drops ids that are not tracked on this config (foreign project/config)", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(4));

    await triggerSelected([
      "keyword_1",
      "some-other-configs-keyword",
      "keyword_3",
      "keyword-from-another-project",
    ]);

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordsTotal: 2,
        keywordIds: ["keyword_1", "keyword_3"],
      }),
    );
  });

  it("rejects a selection where no id belongs to this config", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(4));

    await expect(triggerSelected(["foreign_a", "foreign_b"])).rejects.toMatchObject(
      { code: "VALIDATION_ERROR" },
    );
    expect(guardMocks.beginRankCheckRun).not.toHaveBeenCalled();
  });

  it("throws when the config belongs to a different project", async () => {
    mocks.getConfigById.mockResolvedValue(null);

    await expect(
      RankTrackingServiceOtherProjectCall(),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(guardMocks.beginRankCheckRun).not.toHaveBeenCalled();
  });

  it("throws when the config has no keywords at all", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);

    await expect(triggerSelected(["keyword_1"])).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(guardMocks.beginRankCheckRun).not.toHaveBeenCalled();
  });

  it("forwards config, project, and billing context to the run", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(2));

    await triggerSelected(["keyword_2"]);

    expect(guardMocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        config: activeConfig,
        projectId: "project_1",
        trigger: "manual",
        billingCustomer: {
          userId: "user_1",
          userEmail: "user@example.com",
          organizationId: "org_1",
          projectId: "project_1",
        },
      }),
    );
  });
});

async function RankTrackingServiceOtherProjectCall() {
  const { RankTrackingService } = await import("./RankTrackingService");
  return RankTrackingService.triggerCheck({
    configId: "config_1",
    projectId: "project_other",
    billingCustomer,
    keywordIds: ["keyword_1"],
  });
}
