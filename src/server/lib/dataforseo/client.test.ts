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
  fetchLiveSerp: vi.fn(),
  fetchRankCheckSerp: vi.fn(),
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
// Not wrapped by the client, but re-exported from the sections barrel that
// loadDataforseoSections() pulls in — so leaving it unmocked is what drags the
// ~3 MB dataforseo-client SDK into the run and makes the first test that
// touches the client take seconds instead of milliseconds.
vi.mock("@/server/lib/dataforseo/google-ads", () => ({
  fetchAdsKeywordIdeas: vi.fn(),
  fetchAdsSearchVolume: vi.fn(),
}));

import { waitUntil } from "cloudflare:workers";
import {
  createDataforseoClient,
  mapDataforseoPathToCreditFeature,
} from "@/server/lib/dataforseo/client";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { fetchBacklinksSummary } from "@/server/lib/dataforseo/backlinks";
import { fetchRankCheckSerp } from "@/server/lib/dataforseo/serp";

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

  it("releases the hold for an unbilled invalid-field failure and throws VALIDATION_ERROR", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError(
        "Invalid Field: 'target'.",
        { costUsd: 0, path: backlinksPath },
        true,
      ),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(finalizeMock.mock.calls[0][0]).toMatchObject({ action: "release" });
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

describe("rankCheckBatch", () => {
  const input = {
    keyword: "running shoes",
    keywordId: "kw_1",
    locationCode: 2840,
    languageCode: "en",
    device: "desktop" as const,
    targetDomain: "example.com",
    depth: 10,
  };
  const callEstimate = creditsForProviderUsd(
    dataforseoPricing.serp.rankCheck(input),
  );
  // 2 * ceil(1.28) = 4 credits for two calls, not ceil(2.56) = 3 for their
  // summed cost: each call is credited as it would be unbatched.
  const billed = {
    data: {
      keywordId: "kw_1",
      keyword: "running shoes",
      position: 3,
      url: null,
      serpFeatures: [],
    },
    billing: {
      costUsd: 0.001,
      path: ["v3", "serp", "google", "organic", "live", "advanced"],
    },
  };

  it("bills the batch with one hold on the summed estimate and one confirm on the billed calls", async () => {
    setupHostedMode();
    mockMonthlyBalance(5000);
    vi.mocked(fetchRankCheckSerp)
      .mockResolvedValueOnce(billed)
      .mockRejectedValueOnce(
        new AppError("UPSTREAM_UNAVAILABLE", "DataForSEO timed out"),
      )
      .mockResolvedValueOnce(billed);

    const client = createDataforseoClient(billingCustomer);
    const settled = await client.serp.rankCheckBatch([input, input, input]);

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
    vi.mocked(fetchRankCheckSerp).mockResolvedValue(billed);

    const client = createDataforseoClient(billingCustomer);
    const settled = await client.serp.rankCheckBatch([input, input, input]);

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

describe("mapDataforseoPathToCreditFeature", () => {
  it.each([
    ["v3/dataforseo_labs/google/related_keywords/live", "keyword_research"],
    ["v3/dataforseo_labs/google/keyword_suggestions/live", "keyword_research"],
    ["v3/serp/google/organic/live/regular", "keyword_research"],
    ["v3/keywords_data/google_ads/search_volume/live", "keyword_research"],
    ["v3/dataforseo_labs/google/domain_rank_overview/live", "domain_overview"],
    ["v3/dataforseo_labs/google/ranked_keywords/live", "domain_overview"],
    ["v3/dataforseo_labs/google/relevant_pages/live", "domain_overview"],
    ["v3/backlinks/summary/live", "backlinks"],
    ["backlinks/summary", "backlinks"],
    ["v3/backlinks/referring_domains/live", "backlinks"],
    ["v3/on_page/lighthouse/live/json", "site_audit"],
    ["v3/ai_optimization/llm_mentions/search/live", "ai_citations"],
    ["v3/ai_optimization/llm_mentions/aggregated_metrics/live", "ai_citations"],
    ["v3/ai_optimization/llm_mentions/top_pages/live", "ai_citations"],
    [
      "v3/ai_optimization/ai_keyword_data/keywords_search_volume/live",
      "keyword_research",
    ],
    ["v3/ai_optimization/chat_gpt/llm_responses/live", "ai_prompt_responses"],
    ["v3/ai_optimization/claude/llm_responses/live", "ai_prompt_responses"],
    ["v3/ai_optimization/gemini/llm_responses/live", "ai_prompt_responses"],
    ["v3/ai_optimization/perplexity/llm_responses/live", "ai_prompt_responses"],
    ["v3/business_data/business_listings/search/live", "local_seo"],
    ["v3/serp/google/local_finder/live/advanced", "local_seo"],
    ["v3/serp/google/maps/live/advanced", "local_seo"],
  ])("maps %s to %s", (path, feature) => {
    expect(mapDataforseoPathToCreditFeature(path.split("/"))).toBe(feature);
  });
});
