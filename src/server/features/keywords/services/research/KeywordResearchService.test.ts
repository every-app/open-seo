// Boundary tests for the DataRouter migration: KeywordResearchService must
// never instantiate a DataForSEO client directly; every provider call goes
// through getSeoDataRouter().route (which owns cache + single-flight).
import type {
  AdsKeywordIdeaItem,
  LabsKeywordDataItem,
  SerpLiveItem,
} from "@/server/lib/dataforseo";
import type { KeywordMetricRow } from "@/server/lib/dataforseo/keyword-metrics";
import type { SEODataRequest } from "@/server/lib/seo-data";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // refresh-metrics only reads keyword/location/language off saved rows.
  type SavedKeywordRowFixture = {
    row: { keyword: string; locationCode: number; languageCode: string };
  };
  return {
    seoDataRouter: {
      route: vi.fn<
        (req: SEODataRequest, schema?: unknown) => Promise<unknown>
      >(),
    },
    createDataforseoClient: vi.fn(() => {
      throw new Error("service must not create a DataForSEO client directly");
    }),
    repository: {
      upsertKeywordMetric: vi.fn(async () => {}),
      listSavedKeywordsByProject: vi.fn<
        (params: { projectId: string }) => Promise<{
          rows: SavedKeywordRowFixture[];
          totalCount: number;
          tags: never[];
        }>
      >(async () => ({ rows: [], totalCount: 0, tags: [] })),
    },
  };
});

vi.mock("cloudflare:workers", () => ({
  waitUntil: vi.fn(),
}));

vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => mocks.seoDataRouter,
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));

vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: mocks.repository,
  }),
);

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "alice@example.com",
};

function routerResponse(dataType: string, data: unknown) {
  return {
    dataType,
    provider: "dataforseo",
    fromCache: false,
    durationMs: 100,
    data,
  };
}

function labsItem(
  keyword: string,
  searchVolume: number,
): LabsKeywordDataItem {
  return {
    keyword,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- partial SDK fixture object
    keyword_info: {
      search_volume: searchVolume,
      monthly_searches: [{ year: 2026, month: 5, search_volume: searchVolume }],
    },
  } as LabsKeywordDataItem;
}

function adsIdeaItem(keyword: string, searchVolume: number): AdsKeywordIdeaItem {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- partial SDK fixture object
  return {
    keyword,
    search_volume: searchVolume,
    monthly_searches: [{ year: 2026, month: 5, search_volume: searchVolume }],
  } as AdsKeywordIdeaItem;
}

function metricRow(keyword: string, searchVolume: number): KeywordMetricRow {
  return {
    keyword,
    searchVolume,
    cpc: null,
    competition: null,
    competitionLevel: null,
    keywordDifficulty: null,
    intent: null,
    monthlySearches: [{ year: 2026, month: 5, searchVolume }],
  };
}

const usResearchInput = {
  projectId: "project_1",
  keywords: ["seo tools"],
  locationCode: 2840,
  languageCode: "en",
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
};

// Non-seed rows (all distinct from "seo tools") so the auto waterfall stops
// at the first source with sufficient coverage.
const fiveIdeas = [
  labsItem("seo software", 2400),
  labsItem("seo platform", 1900),
  labsItem("keyword research tool", 1600),
  labsItem("rank tracker", 1200),
  labsItem("backlink checker", 900),
];

beforeEach(() => {
  vi.resetModules();
  mocks.seoDataRouter.route.mockReset();
  mocks.createDataforseoClient.mockClear();
  mocks.repository.upsertKeywordMetric.mockClear();
  mocks.repository.listSavedKeywordsByProject.mockReset();
  mocks.repository.listSavedKeywordsByProject.mockResolvedValue({
    rows: [],
    totalCount: 0,
    tags: [],
  });
});

describe("research", () => {
  it("stops the auto waterfall at 'related' when coverage is sufficient", async () => {
    mocks.seoDataRouter.route.mockResolvedValue(
      routerResponse("keyword_ideas", [
        { keyword_data: labsItem("seo tools", 3600) },
        ...fiveIdeas.map((item) => ({ keyword_data: item })),
      ]),
    );
    const { research } = await import("./research");

    const result = await research(usResearchInput, billingCustomer);

    expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
    expect(mocks.seoDataRouter.route).toHaveBeenCalledWith({
      dataType: "keyword_ideas",
      keyword: "seo tools",
      locationCode: 2840,
      languageCode: "en",
      billingCustomer,
      creditFeature: undefined,
      constraints: {
        source: "related",
        limit: 150,
        depth: 3,
        includeClickstreamData: false,
      },
    });
    expect(result).toMatchObject({
      source: "related",
      usedFallback: false,
      diagnostics: { requestedMode: "auto" },
    });
    expect(result.rows).toHaveLength(6);
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
  });

  it("falls through to suggestions and ideas when related coverage is thin", async () => {
    mocks.seoDataRouter.route
      // related: seed + 2 non-seed — below the auto threshold (5 non-seed)
      .mockResolvedValueOnce(
        routerResponse("keyword_ideas", [
          { keyword_data: labsItem("seo tools", 3600) },
          { keyword_data: labsItem("seo software", 2400) },
          { keyword_data: labsItem("seo platform", 1900) },
        ]),
      )
      // suggestions: 3 more distinct non-seed rows; accumulated coverage hits 5
      .mockResolvedValueOnce(
        routerResponse("keyword_ideas", [
          labsItem("keyword research tool", 1600),
          labsItem("rank tracker", 1200),
          labsItem("backlink checker", 900),
        ]),
      );
    const { research } = await import("./research");

    const result = await research(usResearchInput, billingCustomer);

    expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(2);
    expect(mocks.seoDataRouter.route).toHaveBeenNthCalledWith(2, {
      dataType: "keyword_ideas",
      keyword: "seo tools",
      locationCode: 2840,
      languageCode: "en",
      billingCustomer,
      creditFeature: undefined,
      constraints: {
        source: "suggestions",
        limit: 150,
        includeClickstreamData: false,
      },
    });
    expect(result).toMatchObject({ source: "suggestions", usedFallback: true });
    expect(
      mocks.seoDataRouter.route.mock.calls.some(
        ([req]) => req.constraints?.source === "ideas",
      ),
    ).toBe(false);
  });

  it("serves Google-Ads-only locations via the google_ads source constraint", async () => {
    mocks.seoDataRouter.route.mockResolvedValue(
      routerResponse("keyword_ideas", [
        adsIdeaItem("hotel reykjavik", 1300),
        adsIdeaItem("northern lights tour", 320),
      ]),
    );
    const { research } = await import("./research");

    const result = await research(
      {
        ...usResearchInput,
        keywords: ["hotel reykjavik"],
        locationCode: 2352, // Iceland — Labs doesn't cover it
        languageCode: "is",
      },
      billingCustomer,
    );

    expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
    expect(mocks.seoDataRouter.route).toHaveBeenCalledWith({
      dataType: "keyword_ideas",
      keyword: "hotel reykjavik",
      locationCode: 2352,
      languageCode: "is",
      billingCustomer,
      creditFeature: undefined,
      constraints: { source: "google_ads", limit: 150 },
    });
    expect(result).toMatchObject({ source: "google_ads", usedFallback: false });
    expect(result.rows[0]).toMatchObject({
      keyword: "hotel reykjavik",
      searchVolume: 1300,
      keywordDifficulty: null,
      intent: "unknown",
    });
  });

  it("serves a repeat identical call from the mocked router cache with zero new provider fetches", async () => {
    // Mimic the router cache: first miss fetches "from the provider", repeat
    // calls resolve from cache without reaching any provider SDK.
    let providerFetches = 0;
    const cache = new Map<string, unknown>();
    mocks.seoDataRouter.route.mockImplementation(async (req: SEODataRequest) => {
      const key = JSON.stringify(req);
      const hit = cache.get(key);
      if (hit !== undefined) {
        return { ...hit, provider: "cache", fromCache: true };
      }
      providerFetches += 1;
      const response = routerResponse("keyword_ideas", [
        { keyword_data: labsItem("seo tools", 3600) },
        ...fiveIdeas.map((item) => ({ keyword_data: item })),
      ]);
      cache.set(key, response);
      return response;
    });
    const { research } = await import("./research");

    const first = await research(usResearchInput, billingCustomer);
    const second = await research(usResearchInput, billingCustomer);

    expect(providerFetches).toBe(1);
    expect(second.rows).toEqual(first.rows);
    expect(second.source).toBe(first.source);
  });
});

describe("getSerpAnalysis", () => {
  const serpItems = [
    {
      type: "organic",
      rank_group: 1,
      title: "SEO Tools",
      url: "https://example.com/seo-tools",
      domain: "example.com",
      description: "A list of SEO tools",
    },
    { type: "paid", rank_group: 1, title: "Ad", url: "https://ad.example" },
  ] as SerpLiveItem[];

  it("routes serp data through the router and trims to organic items", async () => {
    mocks.seoDataRouter.route.mockResolvedValue(
      routerResponse("serp", serpItems),
    );
    const { getSerpAnalysis } = await import("./serp");

    const result = await getSerpAnalysis(
      {
        projectId: "project_1",
        keyword: " SEO Tools ",
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(mocks.seoDataRouter.route).toHaveBeenCalledWith({
      dataType: "serp",
      keyword: "seo tools",
      locationCode: 2840,
      languageCode: "en",
      billingCustomer,
    });
    expect(result.requestedKeyword).toBe("seo tools");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      rank: 1,
      domain: "example.com",
    });
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
  });

  it("flags results with no organic items", async () => {
    mocks.seoDataRouter.route.mockResolvedValue(
      routerResponse("serp", [serpItems[1]]),
    );
    const { getSerpAnalysis } = await import("./serp");

    const result = await getSerpAnalysis(
      {
        projectId: "project_1",
        keyword: "seo tools",
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(result.reason).toBe("no_organic_results");
    expect(result.items).toHaveLength(0);
  });
});

describe("refreshSavedKeywordMetrics", () => {
  it("routes metrics through the router and persists rows for the internal provider", async () => {
    mocks.repository.listSavedKeywordsByProject.mockResolvedValue({
      rows: [
        {
          row: {
            keyword: "seo tools",
            locationCode: 2840,
            languageCode: "en",
          },
        },
        {
          row: {
            keyword: "rank tracker",
            locationCode: 2840,
            languageCode: "en",
          },
        },
      ],
      totalCount: 2,
      tags: [],
    });
    mocks.seoDataRouter.route.mockResolvedValue(
      routerResponse("keyword_metrics", [
        metricRow("seo tools", 2400),
        metricRow("rank tracker", 1200),
      ]),
    );
    const { refreshSavedKeywordMetrics } = await import("./refresh-metrics");

    const result = await refreshSavedKeywordMetrics(
      { projectId: "project_1" },
      billingCustomer,
    );

    expect(mocks.seoDataRouter.route).toHaveBeenCalledWith({
      dataType: "keyword_metrics",
      keywords: ["seo tools", "rank tracker"],
      locationCode: 2840,
      languageCode: "en",
      billingCustomer,
      creditFeature: "keyword_research",
      constraints: { projectId: "project_1" },
    });
    expect(result).toEqual({ updated: 2 });
    expect(mocks.repository.upsertKeywordMetric).toHaveBeenCalledTimes(2);
    expect(mocks.repository.upsertKeywordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        keyword: "seo tools",
        searchVolume: 2400,
        intent: "unknown",
      }),
    );
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
  });

  it("groups saved keywords by location/language into homogeneous router calls", async () => {
    mocks.repository.listSavedKeywordsByProject.mockResolvedValue({
      rows: [
        { row: { keyword: "seo tools", locationCode: 2840, languageCode: "en" } },
        { row: { keyword: "seo tools", locationCode: 2826, languageCode: "en" } },
      ],
      totalCount: 2,
      tags: [],
    });
    mocks.seoDataRouter.route.mockResolvedValue(
      routerResponse("keyword_metrics", [metricRow("seo tools", 2400)]),
    );
    const { refreshSavedKeywordMetrics } = await import("./refresh-metrics");

    await refreshSavedKeywordMetrics({ projectId: "project_1" }, billingCustomer);

    const locations = mocks.seoDataRouter.route.mock.calls.map(
      ([req]) => req.locationCode,
    );
    expect(locations.toSorted((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      2826, 2840,
    ]);
  });
});
