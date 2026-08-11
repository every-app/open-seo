import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SEODataRequest } from "@/server/lib/seo-data";

const mocks = vi.hoisted(() => ({
  seoDataRouter: {
    route: vi.fn<
      (request: SEODataRequest, schema?: unknown) => Promise<unknown>
    >(),
  },
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: vi.fn(),
}));

vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => mocks.seoDataRouter,
}));

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
const billingCustomer = { organizationId: "org_123" } as never;

const BASE_INPUT = {
  projectId: "project_1",
  domain: "example.com",
  includeSubdomains: false,
  locationCode: 2840,
  languageCode: "en",
};

const SUGGESTED_INPUT = {
  projectId: "project_1",
  domain: "example.com",
  organizationId: "org_123",
  locationCode: 2840,
  languageCode: "en",
};

function routerResponse(data: unknown, fromCache = false) {
  return {
    dataType: "test",
    provider: fromCache ? "cache" : "dataforseo",
    fromCache,
    durationMs: 12,
    data,
  };
}

function rankedKeywordItem(keyword: string) {
  return {
    keyword_data: {
      keyword,
      keyword_info: { search_volume: 120, cpc: 1.5, keyword_difficulty: 12 },
      keyword_properties: { keyword_difficulty: 12 },
    },
    ranked_serp_element: {
      serp_item: {
        url: `https://example.com/${keyword}`,
        rank_absolute: 3,
        etv: 44,
      },
    },
  };
}

const overviewResponseData = [
  { metrics: { organic: { etv: 1234.6, count: 57.2 } } },
];
const keywordsResponseData = {
  items: [rankedKeywordItem("seo audit")],
  totalCount: 1,
};
const pagesResponseData = {
  items: [
    {
      page_address: "https://example.com/pricing",
      metrics: { organic: { etv: 55.4, count: 7.6 } },
    },
  ],
  totalCount: 1,
};

const domainOverviewResultSchema = z.object({
  domain: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  hasData: z.boolean(),
  fetchedAt: z.string(),
});

const suggestedKeywordResultSchema = z.array(
  z.object({
    keyword: z.string(),
    position: z.number().nullable(),
    searchVolume: z.number().nullable(),
    traffic: z.number().nullable(),
    cpc: z.number().nullable(),
    keywordDifficulty: z.number().nullable(),
  }),
);

const domainKeywordsPageResultSchema = z.object({
  domain: z.string(),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number().nullable(),
  hasMore: z.boolean(),
  keywords: z.array(
    z.object({
      keyword: z.string(),
      position: z.number().nullable(),
      searchVolume: z.number().nullable(),
      traffic: z.number().nullable(),
      cpc: z.number().nullable(),
      url: z.string().nullable(),
      relativeUrl: z.string().nullable(),
      keywordDifficulty: z.number().nullable(),
    }),
  ),
  fetchedAt: z.string(),
});

const domainPagesPageResultSchema = z.object({
  domain: z.string(),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number().nullable(),
  hasMore: z.boolean(),
  pages: z.array(
    z.object({
      page: z.string(),
      relativePath: z.string().nullable(),
      organicTraffic: z.number().nullable(),
      keywords: z.number().nullable(),
    }),
  ),
  fetchedAt: z.string(),
});

describe("DomainService", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.seoDataRouter.route.mockReset();
  });

  describe("getOverview", () => {
    it("routes domain_overview with metering + projectId and maps metrics", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(overviewResponseData),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getOverview(
        { ...BASE_INPUT, includeSubdomains: true },
        billingCustomer,
        { creditFeature: "onboarding" },
      );

      expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
      const request = mocks.seoDataRouter.route.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        dataType: "domain_overview",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        billingCustomer,
        creditFeature: "onboarding",
        constraints: { projectId: "project_1" },
      });

      const parsed = domainOverviewResultSchema.parse(result);
      expect(parsed).toMatchObject({
        domain: "example.com",
        organicTraffic: 1235,
        organicKeywords: 57,
        hasData: true,
      });
    });

    it("returns mapped overview on cache hit without further calls", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(overviewResponseData, true),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getOverview(
        BASE_INPUT,
        billingCustomer,
      );

      const parsed = domainOverviewResultSchema.parse(result);
      expect(parsed.organicKeywords).toBe(57);
      expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
    });

    it("reports hasData=false when the provider returns no metrics", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(routerResponse([]));
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getOverview(
        BASE_INPUT,
        billingCustomer,
      );

      const parsed = domainOverviewResultSchema.parse(result);
      expect(parsed).toMatchObject({
        organicTraffic: null,
        organicKeywords: null,
        hasData: false,
      });
    });
  });

  describe("getSuggestedKeywords", () => {
    it("routes domain_keywords with the suggestion constraints", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(keywordsResponseData),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getSuggestedKeywords(
        SUGGESTED_INPUT,
        billingCustomer,
      );

      const request = mocks.seoDataRouter.route.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        dataType: "domain_keywords",
        domain: "example.com",
        constraints: {
          limit: 100,
          orderBy: ["ranked_serp_element.serp_item.etv,desc"],
          includeSubdomains: true,
          projectId: "project_1",
        },
      });

      const rows = suggestedKeywordResultSchema.parse(result);
      expect(rows[0]).toMatchObject({ keyword: "seo audit", position: 3 });
    });

    it("returns cached suggestions without further calls", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(keywordsResponseData, true),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getSuggestedKeywords(
        SUGGESTED_INPUT,
        billingCustomer,
      );

      const rows = suggestedKeywordResultSchema.parse(result);
      expect(rows).toHaveLength(1);
      expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
    });

    it("returns an empty list when the provider has no items", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse({ items: [], totalCount: 0 }),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getSuggestedKeywords(
        SUGGESTED_INPUT,
        billingCustomer,
      );

      expect(suggestedKeywordResultSchema.parse(result)).toEqual([]);
    });
  });

  describe("getKeywordsPage", () => {
    const PAGE_INPUT = {
      ...BASE_INPUT,
      page: 2,
      pageSize: 10,
      sortMode: "traffic" as const,
      sortOrder: "desc" as const,
      filters: {},
      search: undefined,
    };

    it("routes domain_keywords with pagination constraints", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(keywordsResponseData),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getKeywordsPage(
        PAGE_INPUT,
        billingCustomer,
      );

      const request = mocks.seoDataRouter.route.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        dataType: "domain_keywords",
        domain: "example.com",
        constraints: {
          limit: 10,
          offset: 10,
          orderBy: ["ranked_serp_element.serp_item.etv,desc"],
          includeSubdomains: false,
          projectId: "project_1",
        },
      });
      // Empty filter sets are omitted, matching the previous direct-call behavior.
      expect(request?.constraints && "filters" in request.constraints).toBe(
        false,
      );

      const parsed = domainKeywordsPageResultSchema.parse(result);
      expect(parsed).toMatchObject({
        domain: "example.com",
        page: 2,
        pageSize: 10,
        totalCount: 1,
        hasMore: false,
      });
      expect(parsed.keywords[0]).toMatchObject({
        keyword: "seo audit",
        relativeUrl: "/seo%20audit",
      });
    });

    it("returns a mapped page on cache hit without further calls", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(keywordsResponseData, true),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getKeywordsPage(
        PAGE_INPUT,
        billingCustomer,
      );

      const parsed = domainKeywordsPageResultSchema.parse(result);
      expect(parsed.keywords).toHaveLength(1);
      expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
    });

    it("keeps the response shape on a provider miss", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse({ items: [], totalCount: 0 }),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getKeywordsPage(
        PAGE_INPUT,
        billingCustomer,
      );

      const parsed = domainKeywordsPageResultSchema.parse(result);
      expect(parsed).toMatchObject({
        totalCount: 0,
        hasMore: false,
        keywords: [],
      });
    });
  });

  describe("getPagesPage", () => {
    const PAGE_INPUT = {
      ...BASE_INPUT,
      page: 1,
      pageSize: 25,
      sortMode: "traffic" as const,
      sortOrder: "desc" as const,
      filters: {},
      search: undefined,
    };

    it("routes domain_pages with pagination constraints", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(pagesResponseData),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getPagesPage(
        PAGE_INPUT,
        billingCustomer,
      );

      const request = mocks.seoDataRouter.route.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        dataType: "domain_pages",
        domain: "example.com",
        constraints: {
          limit: 25,
          offset: 0,
          orderBy: ["metrics.organic.etv,desc"],
          includeSubdomains: false,
          projectId: "project_1",
        },
      });
      expect(request?.constraints && "filters" in request.constraints).toBe(
        false,
      );

      const parsed = domainPagesPageResultSchema.parse(result);
      expect(parsed).toMatchObject({
        domain: "example.com",
        page: 1,
        pageSize: 25,
        totalCount: 1,
      });
      expect(parsed.pages[0]).toMatchObject({
        page: "https://example.com/pricing",
        relativePath: "/pricing",
        organicTraffic: 55,
        keywords: 8,
      });
    });

    it("returns a mapped page on cache hit without further calls", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse(pagesResponseData, true),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getPagesPage(
        PAGE_INPUT,
        billingCustomer,
      );

      const parsed = domainPagesPageResultSchema.parse(result);
      expect(parsed.pages).toHaveLength(1);
      expect(mocks.seoDataRouter.route).toHaveBeenCalledTimes(1);
    });

    it("keeps the response shape on a provider miss", async () => {
      mocks.seoDataRouter.route.mockResolvedValue(
        routerResponse({ items: [], totalCount: 0 }),
      );
      const { DomainService } = await import("./DomainService");

      const result = await DomainService.getPagesPage(
        PAGE_INPUT,
        billingCustomer,
      );

      const parsed = domainPagesPageResultSchema.parse(result);
      expect(parsed).toMatchObject({ totalCount: 0, hasMore: false, pages: [] });
    });
  });
});
