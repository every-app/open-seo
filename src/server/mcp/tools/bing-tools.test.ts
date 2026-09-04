import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext } from "@/server/mcp/tools/tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  BingService: {
    getPerformance: vi.fn(),
    getKeywords: vi.fn(),
    getCrawlStats: vi.fn(),
    getLinks: vi.fn(),
    getConnection: vi.fn(),
  },
}));

class BingNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "BingNotConnectedError";
  }
}
class BingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BingApiError";
  }
}
class BingTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BingTokenError";
  }
}
function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof BingTokenError) return true;
  return (
    error instanceof BingApiError &&
    (error.status === 401 || error.status === 403)
  );
}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/bing/services/BingService", () => ({
  BingService: mocks.BingService,
  BingNotConnectedError,
  isExpectedGrantFailure,
}));
vi.mock("@/server/lib/bingClient", () => ({ BingApiError, BingTokenError }));

const toolContext = makeToolContext();

describe("bing MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.BingService.getPerformance.mockReset();
    mocks.BingService.getKeywords.mockReset();
    mocks.BingService.getCrawlStats.mockReset();
    mocks.BingService.getLinks.mockReset();
    mocks.BingService.getConnection.mockReset();
  });

  it("exports the four planned read-only tool names", async () => {
    const {
      getBingPerformanceTool,
      getBingKeywordsTool,
      getBingCrawlStatsTool,
      getBingLinksTool,
    } = await import("./bing-tools");

    expect([
      getBingPerformanceTool.name,
      getBingKeywordsTool.name,
      getBingCrawlStatsTool.name,
      getBingLinksTool.name,
    ]).toEqual([
      "get_bing_search_performance",
      "get_bing_keywords",
      "get_bing_crawl_stats",
      "get_bing_links",
    ]);
    for (const tool of [
      getBingPerformanceTool,
      getBingKeywordsTool,
      getBingCrawlStatsTool,
      getBingLinksTool,
    ]) {
      expect(tool.config.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
    }
  });

  it("renders the daily rows as a table", async () => {
    mocks.BingService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      rows: [
        { date: "2026-01-01T00:00:00.000Z", clicks: 10, impressions: 200 },
        { date: "2026-01-02T00:00:00.000Z", clicks: 5, impressions: 50 },
      ],
    });
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.BingService.getPerformance).toHaveBeenCalledWith({
      projectId: "project_1",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 2,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "date | clicks | impressions",
    );
    expect(first.type === "text" && first.text).toContain("2026-01-01");
    expect(first.type === "text" && first.text).toContain("200");
  });

  it("renders an unparseable date without inventing one", async () => {
    // bingClient maps a WCF date it cannot parse to null rather than guessing.
    mocks.BingService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: null,
      rows: [{ date: null, clicks: 1, impressions: 3 }],
    });
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("(unknown)");
  });

  it("returns a friendly connect message for a not-connected project", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new BingNotConnectedError("project_1"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "Bing Webmaster is not connected",
    );
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("returns a reconnect message for a revoked grant (BingTokenError)", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new BingTokenError("revoked"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "expired or was revoked",
    );
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("returns a reconnect message for a 401 BingApiError", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new BingApiError(401, "denied"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "expired or was revoked",
    );
  });

  it("returns an empty-state message instead of a table when there are no rows", async () => {
    mocks.BingService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      rows: [],
    });
    const { getBingPerformanceTool } = await import("./bing-tools");

    const result = await getBingPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 0,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "No Bing Webmaster performance data",
    );
    expect(first.type === "text" && first.text).not.toContain("|");
  });

  it("propagates unexpected errors rather than masking them", async () => {
    mocks.BingService.getPerformance.mockRejectedValue(
      new Error("database exploded"),
    );
    const { getBingPerformanceTool } = await import("./bing-tools");

    await expect(
      getBingPerformanceTool.handler({ projectId: "project_1" }, toolContext),
    ).rejects.toThrow("database exploded");
  });

  it("renders Bing crawl statistics with the selected site's evidence", async () => {
    mocks.BingService.getCrawlStats.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      rows: [
        {
          date: "2026-01-01T00:00:00.000Z",
          crawledPages: 50,
          inIndex: 40,
          crawlErrors: 2,
          code4xx: 1,
          code5xx: 0,
          blockedByRobotsTxt: 7,
          containsMalware: 0,
        },
      ],
    });
    const { getBingCrawlStatsTool } = await import("./bing-tools");

    const result = await getBingCrawlStatsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.BingService.getCrawlStats).toHaveBeenCalledWith({
      projectId: "project_1",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 1,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "crawled | in index | crawl errors",
    );
  });

  it("renders sampled Bing keyword evidence and average positions", async () => {
    mocks.BingService.getKeywords.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      rows: [
        {
          query: "open source seo",
          date: "2026-01-01T00:00:00.000Z",
          clicks: 4,
          impressions: 80,
          averageClickPosition: 3.5,
          averageImpressionPosition: 7.25,
        },
      ],
    });
    const { getBingKeywordsTool } = await import("./bing-tools");

    const result = await getBingKeywordsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.BingService.getKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 1,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "query | date | clicks | impressions | avg impression position",
    );
    expect(first.type === "text" && first.text).toContain("open source seo");
  });

  it("reads a bounded Bing links page and reports paging without claiming completeness", async () => {
    mocks.BingService.getLinks.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: null,
      page: 2,
      totalPages: 4,
      links: [{ url: "https://ref.example/article", count: 3 }],
    });
    const { getBingLinksTool } = await import("./bing-tools");

    const result = await getBingLinksTool.handler(
      { projectId: "project_1", page: 2 },
      toolContext,
    );

    expect(mocks.BingService.getLinks).toHaveBeenCalledWith({
      projectId: "project_1",
      page: 2,
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      page: 2,
      totalPages: 4,
      linkCount: 1,
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "Bing link page 2 of 4",
    );
  });

  it("uses the common reconnect handling for crawl and link tools", async () => {
    mocks.BingService.getCrawlStats.mockRejectedValue(
      new BingTokenError("revoked"),
    );
    mocks.BingService.getLinks.mockRejectedValue(
      new BingNotConnectedError("project_1"),
    );
    const { getBingCrawlStatsTool, getBingLinksTool } =
      await import("./bing-tools");

    const crawl = await getBingCrawlStatsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );
    const links = await getBingLinksTool.handler(
      { projectId: "project_1", page: 0 },
      toolContext,
    );

    expect(crawl.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
    expect(links.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });
});
