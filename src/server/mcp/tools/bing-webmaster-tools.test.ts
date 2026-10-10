import { beforeEach, describe, expect, it, vi } from "vitest";
import { BingAuthError, BingNotConnectedError } from "@/server/lib/bingErrors";
import {
  getBingCrawlStatsTool,
  getBingSearchPerformanceTool,
  inspectBingUrlsTool,
} from "./bing-webmaster-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getPerformance: vi.fn(),
  getSummary: vi.fn(),
  getCrawl: vi.fn(),
  inspectUrls: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/bing/services/BingService", () => ({
  BingService: {
    getPerformance: mocks.getPerformance,
    getSummary: mocks.getSummary,
    getCrawl: mocks.getCrawl,
    inspectUrls: mocks.inspectUrls,
  },
}));

const toolContext = makeToolContext();

describe("get_bing_search_performance", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    // The whole-site summary is its own call; the tool merges it into `total`.
    mocks.getSummary.mockResolvedValue({
      siteUrl: "https://example.com/",
      coverage: {
        startDate: "2024-05-01",
        endDate: "2024-05-30",
        days: 30,
        timeZone: "UTC",
      },
      summary: { clicks: 12, impressions: 300, ctr: 0.04, position: 7.5 },
    });
  });

  it("returns aggregated rows and forwards the group-by input", async () => {
    mocks.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      groupBy: "query",
      coverage: {
        startDate: "2024-05-01",
        endDate: "2024-05-30",
        days: 30,
        timeZone: "UTC",
      },
      rows: [
        {
          key: "seo tools",
          clicks: 12,
          impressions: 300,
          ctr: 0.04,
          position: 7.5,
        },
      ],
    });

    const result = await getBingSearchPerformanceTool.handler(
      { projectId: "project_1", groupBy: "query", minImpressions: 50 },
      toolContext,
    );

    expect(mocks.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        groupBy: "query",
        minImpressions: 50,
      }),
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      groupBy: "query",
      rowCount: 1,
      coverage: { days: 30, timeZone: "UTC" },
      total: { clicks: 12, impressions: 300 },
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "key | clicks | impressions | CTR | position",
    );
    expect(text?.type === "text" && text.text).toContain("seo tools");
    expect(text?.type === "text" && text.text).toContain("4.0%");
  });

  it("returns a connect prompt when the project has no Bing connection", async () => {
    mocks.getPerformance.mockRejectedValue(new BingNotConnectedError("p1"));

    const result = await getBingSearchPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "/p/project_1/settings/integrations",
    );
  });

  it("maps a rejected API key to an api_error with a reconnect prompt", async () => {
    mocks.getPerformance.mockRejectedValue(new BingAuthError("rejected"));

    const result = await getBingSearchPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("reconnect");
  });
});

describe("inspect_bing_urls", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("renders a crawl summary per URL", async () => {
    mocks.inspectUrls.mockResolvedValue({
      siteUrl: "https://example.com/",
      results: [
        {
          url: "https://example.com/a",
          result: {
            url: "https://example.com/a",
            httpStatusReported: true,
            httpStatus: 200,
            lastCrawledDate: "2024-05-30",
            anchorCount: 5,
          },
        },
      ],
    });

    const result = await inspectBingUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/a"] },
      toolContext,
    );

    expect(mocks.inspectUrls).toHaveBeenCalledWith({
      projectId: "project_1",
      urls: ["https://example.com/a"],
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("HTTP 200");
    expect(text?.type === "text" && text.text).toContain(
      "last crawled 2024-05-30",
    );
  });

  it("returns a connect prompt when not connected", async () => {
    mocks.inspectUrls.mockRejectedValue(new BingNotConnectedError("p1"));

    const result = await inspectBingUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/a"] },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });
});

describe("get_bing_crawl_stats", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("reports the latest day's counts and the crawl issues", async () => {
    mocks.getCrawl.mockResolvedValue({
      siteUrl: "https://example.com/",
      stats: [
        {
          date: "2024-05-01",
          crawledPages: 10,
          inIndex: 5,
          crawlErrors: 1,
          code2xx: 9,
          code301: 0,
          code302: 0,
          code4xx: 1,
          code5xx: 0,
          blockedByRobotsTxt: 0,
          dnsFailures: 0,
          connectionTimeout: 0,
          containsMalware: 0,
          inLinks: 2,
        },
        {
          date: "2024-05-02",
          crawledPages: 12,
          inIndex: 6,
          crawlErrors: 2,
          code2xx: 10,
          code301: 0,
          code302: 0,
          code4xx: 2,
          code5xx: 0,
          blockedByRobotsTxt: 0,
          dnsFailures: 0,
          connectionTimeout: 0,
          containsMalware: 0,
          inLinks: 3,
        },
      ],
      issues: [{ url: "https://example.com/gone", httpCode: 404, issues: 4 }],
    });

    const result = await getBingCrawlStatsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      days: 2,
      issueCount: 1,
      latest: { date: "2024-05-02", crawledPages: 12 },
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("Latest 2024-05-02");
    expect(text?.type === "text" && text.text).toContain(
      "https://example.com/gone",
    );
  });

  it("returns a connect prompt when the project has no Bing connection", async () => {
    mocks.getCrawl.mockRejectedValue(new BingNotConnectedError("p1"));

    const result = await getBingCrawlStatsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });
});
