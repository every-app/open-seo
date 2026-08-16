import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketTools } from "./onboardingMarketTools";

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => ({ route: mocks.route }),
}));

const billingCustomer = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "user@example.com",
};

const project = {
  id: "project_1",
  domain: "acme.com",
  locationCode: 2840,
  languageCode: "en",
  organizationId: "org_1",
};

const serpItems = [
  {
    type: "organic",
    rank_group: 1,
    rank_absolute: 1,
    domain: "acme.com",
    title: "Acme",
    url: "https://acme.com",
  },
  { type: "organic", rank_group: 2, domain: "rival.com", url: "https://rival.com" },
  { type: "paid", rank_group: 1, domain: "advertiser.com" },
];

const competitorItems = [
  { domain: "acme.com", keywords_count: 200, avg_position: 3.2, etv: 800 },
  { domain: "rival.com", keywords_count: 300, avg_position: 2.1, etv: 1500 },
  { domain: "longtail.com", keywords_count: 40, avg_position: 9.4, etv: 60 },
];

function buildTools(overrides: Partial<typeof project> = {}) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test helper narrows ToolSet to the tools under test
  return marketTools({
    project: { ...project, ...overrides },
    organizationId: "org_1",
    billingCustomer,
    metering: { creditFeature: "onboarding" },
    isSameDomain: (domain) =>
      typeof domain === "string" &&
      domain.replace(/^www\./, "").toLowerCase() === "acme.com",
  }) as unknown as {
    get_serp_results: {
      execute: (input: { keywords: string[] }) => Promise<unknown>;
    };
    find_serp_competitors: {
      execute: (input: { keywords: string[] }) => Promise<unknown>;
    };
  };
}

describe("marketTools.get_serp_results", () => {
  beforeEach(() => {
    mocks.route.mockReset();
  });

  it(
    "routes each keyword through the seo data router and maps organic results",
    async () => {
      mocks.route.mockResolvedValue({ data: serpItems });
      const tools = buildTools();

      const result = await tools.get_serp_results.execute({
        keywords: ["seo tool", "rank tracker"],
      });

      expect(mocks.route).toHaveBeenCalledTimes(2);
      expect(mocks.route).toHaveBeenNthCalledWith(1, {
        dataType: "serp",
        keyword: "seo tool",
        locationCode: 2840,
        languageCode: "en",
        billingCustomer,
        creditFeature: "onboarding",
      });
      expect(mocks.route).toHaveBeenNthCalledWith(2, {
        dataType: "serp",
        keyword: "rank tracker",
        locationCode: 2840,
        languageCode: "en",
        billingCustomer,
        creditFeature: "onboarding",
      });
      expect(result).toEqual({
        results: [
          {
            keyword: "seo tool",
            ok: true,
            results: [
              {
                rank: 1,
                domain: "acme.com",
                title: "Acme",
                url: "https://acme.com",
              },
              {
                rank: 2,
                domain: "rival.com",
                title: null,
                url: "https://rival.com",
              },
            ],
          },
          {
            keyword: "rank tracker",
            ok: true,
            results: [
              {
                rank: 1,
                domain: "acme.com",
                title: "Acme",
                url: "https://acme.com",
              },
              {
                rank: 2,
                domain: "rival.com",
                title: null,
                url: "https://rival.com",
              },
            ],
          },
        ],
      });
    },
    30000,
  );

  it("keeps per-keyword failures isolated instead of failing the whole batch", async () => {
    mocks.route
      .mockResolvedValueOnce({ data: serpItems })
      .mockRejectedValueOnce(new Error("Budget exceeded"));
    const tools = buildTools();

    const result = await tools.get_serp_results.execute({
      keywords: ["seo tool", "rank tracker"],
    });

    expect(result).toEqual({
      results: [
        {
          keyword: "seo tool",
          ok: true,
          // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher
          results: expect.any(Array),
        },
        {
          keyword: "rank tracker",
          ok: false,
          error: "Budget exceeded",
        },
      ],
    });
  });
});

describe("marketTools.find_serp_competitors", () => {
  beforeEach(() => {
    mocks.route.mockReset();
  });

  it("routes through the competitors data type, filtering self-domain and sorting by etv", async () => {
    mocks.route.mockResolvedValue({ data: competitorItems });
    const tools = buildTools();

    const result = await tools.find_serp_competitors.execute({
      keywords: ["seo tool", "rank tracker"],
    });

    expect(mocks.route).toHaveBeenCalledTimes(1);
    expect(mocks.route).toHaveBeenCalledWith({
      dataType: "competitors",
      keywords: ["seo tool", "rank tracker"],
      locationCode: 2840,
      languageCode: "en",
      billingCustomer,
      creditFeature: "onboarding",
      constraints: { projectId: "project_1", limit: 50 },
    });
    // acme.com (the user's own domain) is dropped; rivals sorted by etv desc.
    expect(result).toEqual({
      available: true,
      competitors: [
        {
          domain: "rival.com",
          keywordsCount: 300,
          avgPosition: 2.1,
          estimatedTraffic: 1500,
        },
        {
          domain: "longtail.com",
          keywordsCount: 40,
          avgPosition: 9.4,
          estimatedTraffic: 60,
        },
      ],
    });
  });

  it("skips routing entirely for markets without competitor data", async () => {
    mocks.route.mockResolvedValue({ data: competitorItems });
    // 2352 = Iceland, served from Google Ads data (no Labs competitor data).
    const tools = buildTools({ locationCode: 2352 });

    const result = await tools.find_serp_competitors.execute({
      keywords: ["seo tool"],
    });

    expect(mocks.route).not.toHaveBeenCalled();
    expect(result).toEqual({
      available: false,
      reason: "Competitor data isn't available for this market yet.",
    });
  });
});