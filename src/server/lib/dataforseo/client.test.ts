/* eslint-disable max-lines */
import { describe, expect, it, vi } from "vitest";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  creditsForProviderUsd,
} from "@/shared/billing";

interface CheckCallArg {
  customerId: string;
  featureId: string;
  requiredBalance?: number;
  lock?: { lockId: string };
}

interface CheckResult {
  allowed: boolean;
  balance: { remaining: number } | null;
}

interface FinalizeCallArg {
  lockId: string;
  action: "confirm" | "release";
  overrideValue?: number;
}

const {
  checkMock,
  finalizeMock,
  getOrCreateMock,
  isHostedServerAuthModeMock,
  mockEnv,
} = vi.hoisted(() => ({
  checkMock: vi.fn<(arg: CheckCallArg) => Promise<CheckResult>>(),
  finalizeMock:
    vi.fn<(arg: FinalizeCallArg) => Promise<{ success: boolean }>>(),
  getOrCreateMock: vi.fn(),
  isHostedServerAuthModeMock: vi.fn(),
  mockEnv: {},
}));

vi.mock("cloudflare:workers", () => ({
  env: mockEnv,
  waitUntil: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: checkMock,
    balances: { finalize: finalizeMock },
  },
  AUTUMN_TRACK_RETRY_OPTIONS: {},
}));

// Keep the real subscription module (reserve/settle run against the mocked
// autumn facade) and only stub the customer lookup, so the hold logic stays
// exercised end to end through the client.
vi.mock("@/server/billing/subscription", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getOrCreateOrganizationCustomer: getOrCreateMock,
  };
});

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHostedServerAuthModeMock,
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@/server/email/onboarding-drip", () => ({
  sendCreditsExhaustedEvent: vi.fn(),
}));

// Mock every section module the client wraps so meterDataforseoCall's
// `execute()` resolves to a controllable fixture.
vi.mock("@/server/lib/dataforseo/labs", () => ({
  fetchRelatedKeywords: vi.fn(),
  fetchKeywordSuggestions: vi.fn(),
  fetchKeywordIdeas: vi.fn(),
  fetchDomainRankOverview: vi.fn(),
  fetchRankedKeywords: vi.fn(),
  fetchRelevantPages: vi.fn(),
  fetchKeywordOverview: vi.fn(),
  fetchSerpCompetitors: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/serp", () => ({
  postSerpReadTasks: vi.fn(),
  SERP_READS_PER_QUERY: 3,
  postRankCheckTasks: vi.fn(),
  fetchLocalSerp: vi.fn(),
  postLocalSerpTasks: vi.fn(),
  clampSerpDepth: (depth: number) => depth,
  SERP_ANALYSIS_DEPTH: 20,
}));
vi.mock("@/server/lib/dataforseo/business", () => ({
  fetchBusinessListingsSearch: vi.fn(),
  fetchQuestionsAnswers: vi.fn(),
  fetchMyBusinessInfo: vi.fn(),
  postGoogleReviewsTask: vi.fn(),
  postMyBusinessUpdatesTask: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/google-ads", () => ({
  fetchAdsKeywordIdeas: vi.fn(),
  fetchAdsSearchVolume: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/backlinks", () => ({
  fetchBacklinksSummary: vi.fn(),
  fetchBacklinksRows: vi.fn(),
  fetchReferringDomains: vi.fn(),
  fetchDomainPagesSummary: vi.fn(),
  fetchBacklinksHistory: vi.fn(),
  BACKLINKS_DEFAULT_LIMIT: 100,
}));
vi.mock("@/server/lib/dataforseo/lighthouse", () => ({
  fetchLighthouseResult: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/ai", () => ({
  fetchLlmMentionsSearch: vi.fn(),
  fetchLlmAggregatedMetrics: vi.fn(),
  fetchLlmTopPages: vi.fn(),
  fetchLlmCrossAggregatedMetrics: vi.fn(),
  fetchLlmResponse: vi.fn(),
  resolveLlmMentionsLimit: (limit?: number) => limit ?? 100,
  LLM_RESPONSE_WEB_SEARCH_DEFAULT: true,
}));

vi.mock("@/server/lib/dataforseo/ai-tracking", () => ({
  postAiTrackingTasks: vi.fn(),
  fetchAiTrackingLiveAnswer: vi.fn(),
}));

import { waitUntil } from "cloudflare:workers";
import { createDataforseoClient } from "@/server/lib/dataforseo/client";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { fetchBacklinksSummary } from "@/server/lib/dataforseo/backlinks";
import { postSerpReadTasks } from "@/server/lib/dataforseo/serp";
import { postAiTrackingTasks } from "@/server/lib/dataforseo/ai-tracking";

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "alice@example.com",
};

const backlinksInput = {
  target: "example.com",
};
const backlinksPath = ["v3", "backlinks", "summary", "live"];

// Below the summary estimate, as a real charge is (the estimate is an upper bound).
const RAW_COST = 0.02;
const EXPECTED_CREDITS = creditsForProviderUsd(RAW_COST);
const ESTIMATED_CREDITS = creditsForProviderUsd(
  dataforseoPricing.backlinks.summary(backlinksInput),
);

function setupHostedMode() {
  isHostedServerAuthModeMock.mockResolvedValue(true);
  getOrCreateMock.mockResolvedValue({ id: "org_123" });
  finalizeMock.mockResolvedValue({ success: true });
}

// Monthly balance only; topup reads empty.
function mockMonthlyBalance(monthly: number) {
  checkMock.mockImplementation(async (args) => {
    const remaining =
      args.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID ? monthly : 0;
    return {
      allowed: remaining >= (args.requiredBalance ?? 1),
      balance: { remaining },
    };
  });
}

function mockDataforseoResult(costUsd: number) {
  vi.mocked(fetchBacklinksSummary).mockResolvedValue({
    data: { rank: 42 },
    billing: { costUsd, path: backlinksPath },
  });
}

describe("meterDataforseoCall", () => {
  it("skips billing in non-hosted mode", async () => {
    isHostedServerAuthModeMock.mockResolvedValue(false);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    const result = await client.backlinks.summary(backlinksInput);

    expect(result).toEqual({ rank: 42 });
    expect(checkMock).not.toHaveBeenCalled();
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("never calls the provider when the hold is refused", async () => {
    setupHostedMode();
    mockMonthlyBalance(0);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });

    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(fetchBacklinksSummary).not.toHaveBeenCalled();
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("holds the estimate, then confirms the hold at the billed cost", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    const result = await client.backlinks.summary(backlinksInput);

    expect(result).toEqual({ rank: 42 });
    expect(checkMock).toHaveBeenCalledTimes(1);
    const [holdCall] = checkMock.mock.calls[0];
    expect(holdCall).toMatchObject({
      customerId: "org_123",
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      requiredBalance: ESTIMATED_CREDITS,
      // Autumn files the hold and the settle as separate usage events, so the
      // billing page's feature breakdown needs the feature on the hold too.
      properties: { creditFeature: "backlinks" },
    });
    // The execute + settle chain is registered with the request so a client
    // disconnect after dispatch cannot skip the deduction.
    expect(vi.mocked(waitUntil)).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0][0]).toMatchObject({
      lockId: holdCall.lock?.lockId,
      action: "confirm",
      overrideValue: EXPECTED_CREDITS,
    });
  });

  it("confirms a charged DataForSEO task failure at its cost before rethrowing", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError("DataForSEO task failed", {
        costUsd: RAW_COST,
        path: backlinksPath,
      }),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(client.backlinks.summary(backlinksInput)).rejects.toThrow(
      "DataForSEO task failed",
    );

    expect(finalizeMock.mock.calls[0][0]).toMatchObject({
      action: "confirm",
      overrideValue: EXPECTED_CREDITS,
    });
  });

  it("releases the hold for an unbilled invalid-field failure, logs the field but not its value, and throws VALIDATION_ERROR", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError(
        `Invalid Field: 'target'. (sent target="customer.example")`,
        { costUsd: 0, path: backlinksPath },
        true,
      ),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(finalizeMock.mock.calls[0][0]).toMatchObject({ action: "release" });
    expect(warn).toHaveBeenCalledWith("dataforseo.invalid-field", {
      event: "dataforseo.invalid-field",
      path: "/v3/backlinks/summary/live",
      field: "target",
    });
    warn.mockRestore();
  });

  it("releases the hold when the provider call fails before billing", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new AppError("UPSTREAM_UNAVAILABLE", "DataForSEO timed out"),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    expect(vi.mocked(waitUntil)).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0][0]).toMatchObject({ action: "release" });
  });
});

describe("AI visibility queued posts", () => {
  const input = {
    engine: "chatgpt" as const,
    locationCode: 2840,
    languageCode: "en",
    tasks: [
      { tag: "a", prompt: "Which SEO tools?" },
      { tag: "b", prompt: "Best rank tracker?" },
    ],
  };

  it("holds credits at post and charges the arrived answers as one rounded sum", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(postAiTrackingTasks).mockResolvedValue({
      data: [
        { tag: "a", taskId: "task-a", costUsd: 0.0011 },
        { tag: "b", taskId: "task-b", costUsd: 0.0011 },
      ],
      billing: { costUsd: 0.0022, path: ["task_post"] },
    });

    const client = createDataforseoClient(billingCustomer);
    const { hold } = await client.aiSearch.trackingTaskPost(input);
    expect(finalizeMock).not.toHaveBeenCalled();
    await client.aiSearch.settleTrackingHold({
      hold: hold!,
      costs: [0.0011, 0.0011],
    });

    // Rounding each answer up would charge 4 credits; the sum rounds to 3.
    expect(finalizeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        lockId: checkMock.mock.calls[0][0].lock?.lockId,
        action: "confirm",
        overrideValue: creditsForProviderUsd(0.0022),
      }),
      {},
    );
  });

  it("releases the hold when the post fails", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(postAiTrackingTasks).mockRejectedValue(
      new AppError("UPSTREAM_UNAVAILABLE"),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(client.aiSearch.trackingTaskPost(input)).rejects.toMatchObject(
      { code: "UPSTREAM_UNAVAILABLE" },
    );

    expect(finalizeMock.mock.calls[0][0]).toMatchObject({ action: "release" });
  });
});

describe("readsTaskPostBatch", () => {
  const input = {
    keyword: "running shoes",
    locationCode: 2840,
    languageCode: "en",
    device: "desktop" as const,
    depth: 10,
  };
  const callEstimate = creditsForProviderUsd(
    dataforseoPricing.serp.readsTaskPost(input),
  );
  // 2 * ceil(1.28) = 4 credits for two calls, not ceil(2.56) = 3 for their
  // summed cost: each call is credited as it would be unbatched.
  const billed = {
    data: ["task-1", "task-2", "task-3"],
    billing: {
      costUsd: 0.001,
      path: ["v3", "serp", "google", "organic", "task_post"],
    },
  };

  it("bills the batch with one hold on the summed estimate and one confirm on the billed calls", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(postSerpReadTasks)
      .mockResolvedValueOnce(billed)
      .mockRejectedValueOnce(
        new AppError("UPSTREAM_UNAVAILABLE", "DataForSEO timed out"),
      )
      .mockResolvedValueOnce(billed);

    const client = createDataforseoClient(billingCustomer);
    const settled = await client.serp.readsTaskPostBatch([input, input, input]);

    expect(settled.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock.mock.calls[0][0]).toMatchObject({
      requiredBalance: 3 * callEstimate,
    });
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0][0]).toMatchObject({
      action: "confirm",
      overrideValue: 2 * creditsForProviderUsd(0.001),
    });
  });

  it("splits a batch across monthly and top-up when only both together cover it", async () => {
    setupHostedMode();
    // Monthly covers two calls, top-up one: neither covers all three.
    checkMock.mockImplementation(async (args) => {
      const balance =
        args.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
          ? 2 * callEstimate
          : callEstimate;
      return {
        allowed: balance >= (args.requiredBalance ?? 1),
        balance: { remaining: balance },
      };
    });
    vi.mocked(postSerpReadTasks).mockResolvedValue(billed);

    const client = createDataforseoClient(billingCustomer);
    const settled = await client.serp.readsTaskPostBatch([input, input, input]);

    expect(settled.every((outcome) => outcome.status === "fulfilled")).toBe(
      true,
    );
    // After the refused whole-batch monthly hold.
    const [monthlyHold, topupHold] = checkMock.mock.calls
      .slice(1)
      .map(([arg]) => arg);
    expect(monthlyHold).toMatchObject({
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      requiredBalance: 2 * callEstimate,
    });
    expect(topupHold).toMatchObject({
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      requiredBalance: callEstimate,
    });
    expect(finalizeMock.mock.calls.map(([arg]) => arg)).toMatchObject([
      {
        lockId: monthlyHold.lock?.lockId,
        overrideValue: 2 * creditsForProviderUsd(0.001),
      },
      {
        lockId: topupHold.lock?.lockId,
        overrideValue: creditsForProviderUsd(0.001),
      },
    ]);
  });
});
