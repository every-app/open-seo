import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type BingStatRow = {
    key: string;
    clicks: number;
    impressions: number;
    date: string | null;
    avgImpressionPosition: number;
  };
  const getQueryStats = vi.fn<() => Promise<BingStatRow[]>>();
  const getPageStats = vi.fn<() => Promise<BingStatRow[]>>();
  const getPageQueryStats =
    vi.fn<(siteUrl: string, pageUrl: string) => Promise<BingStatRow[]>>();
  const getCrawlStats =
    vi.fn<(siteUrl: string) => Promise<Record<string, unknown>[]>>();
  const getUrlInfo =
    vi.fn<(siteUrl: string, url: string) => Promise<Record<string, unknown>>>();
  return {
    getQueryStats,
    getPageStats,
    getPageQueryStats,
    getCrawlStats,
    getUrlInfo,
    createBingClient: vi.fn(() => ({
      getQueryStats,
      getPageStats,
      getPageQueryStats,
      getCrawlStats,
      getUrlInfo,
    })),
    getByProjectId: vi.fn(),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/lib/bingClient", () => ({
  createBingClient: mocks.createBingClient,
  BingApiError: class extends Error {},
  BingTokenError: class extends Error {},
}));
vi.mock("@/server/features/bing/repositories/BingConnectionRepository", () => ({
  BingConnectionRepository: { getByProjectId: mocks.getByProjectId },
}));

const oauthConnection = {
  connectedByUserId: "u1",
  connectedAccountEmail: "a@example.com",
  bingAccountId: "uid-a",
  siteUrl: "https://x.example/",
  authMode: "oauth",
};

const statRow = (
  key: string,
  clicks: number,
  impressions: number,
  avgImpressionPosition: number,
) => ({
  key,
  clicks,
  impressions,
  date: "2026-05-01T00:00:00.000Z",
  avgImpressionPosition,
});

describe("BingService.getQueryReport", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getQueryStats.mockReset().mockResolvedValue([]);
    mocks.getPageStats.mockReset().mockResolvedValue([]);
    mocks.createBingClient.mockClear();
  });

  it("throws BingNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingService, BingNotConnectedError } =
      await import("./BingService");

    await expect(
      BingService.getQueryReport({ projectId: "p1" }),
    ).rejects.toBeInstanceOf(BingNotConnectedError);
    expect(mocks.createBingClient).not.toHaveBeenCalled();
  });

  it("rejects api_key connections with a clear AppError", async () => {
    mocks.getByProjectId.mockResolvedValue({
      ...oauthConnection,
      authMode: "api_key",
    });
    const { BingService } = await import("./BingService");

    await expect(
      BingService.getQueryReport({ projectId: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.createBingClient).not.toHaveBeenCalled();
  });

  it("aggregates sampled query and page rows and derives striking distance", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);
    mocks.getQueryStats.mockResolvedValue([
      statRow("striking query", 2, 100, 7),
      statRow("striking query", 4, 300, 9),
      statRow("top query", 50, 500, 2),
    ]);
    mocks.getPageStats.mockResolvedValue([
      statRow("https://x.example/pricing", 10, 200, 6),
    ]);
    const { BingService } = await import("./BingService");

    const report = await BingService.getQueryReport({ projectId: "p1" });

    expect(report.siteUrl).toBe("https://x.example/");
    expect(report.connectedBy).toBe("a@example.com");
    // Aggregation math is covered in bingQueryReport.test.ts; here we assert
    // the wiring: multi-date rows collapse, and the sampled per-row `date`
    // fields do not survive into the aggregate.
    expect(report.queries.map((row) => row.key)).toEqual([
      "top query",
      "striking query",
    ]);
    expect(report.queries[1]).toMatchObject({
      clicks: 6,
      impressions: 400,
      position: 8.5,
    });
    expect(report.pages.map((row) => row.key)).toEqual([
      "https://x.example/pricing",
    ]);
    // top query sits at position 2 — outside the 5-20 band.
    expect(report.striking.map((row) => row.key)).toEqual(["striking query"]);
    expect(mocks.createBingClient).toHaveBeenCalledWith({
      userId: "u1",
      bingAccountId: "uid-a",
    });
  });
});

describe("BingService.getPageQueries", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getPageQueryStats.mockReset().mockResolvedValue([]);
    mocks.createBingClient.mockClear();
  });

  it("throws BingNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingService, BingNotConnectedError } =
      await import("./BingService");

    await expect(
      BingService.getPageQueries({ projectId: "p1", pageUrl: "https://x/" }),
    ).rejects.toBeInstanceOf(BingNotConnectedError);
  });

  it("fetches queries for the page against the connected site and aggregates", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);
    mocks.getPageQueryStats.mockResolvedValue([
      statRow("doi lookup", 1, 100, 7),
      statRow("doi lookup", 2, 100, 9),
    ]);
    const { BingService } = await import("./BingService");

    const result = await BingService.getPageQueries({
      projectId: "p1",
      pageUrl: "https://x.example/tools/doi-lookup",
    });

    expect(mocks.getPageQueryStats).toHaveBeenCalledWith(
      "https://x.example/",
      "https://x.example/tools/doi-lookup",
    );
    expect(result.pageUrl).toBe("https://x.example/tools/doi-lookup");
    expect(result.queries).toEqual([
      {
        key: "doi lookup",
        clicks: 3,
        impressions: 200,
        ctr: 0.015,
        position: 8,
      },
    ]);
  });

  it("returns an empty list for a page Bing has not sampled", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);
    const { BingService } = await import("./BingService");

    await expect(
      BingService.getPageQueries({
        projectId: "p1",
        pageUrl: "https://x.example/nope",
      }),
    ).resolves.toMatchObject({ queries: [] });
  });
});

const crawlRow = (date: string | null, inIndex: number) => ({
  date,
  crawledPages: 100,
  inIndex,
  inLinks: 120,
  crawlErrors: 0,
  code4xx: 0,
  code5xx: 0,
});

describe("BingService.getCrawlStats", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getCrawlStats.mockReset().mockResolvedValue([]);
    mocks.createBingClient.mockClear();
  });

  it("throws BingNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingService, BingNotConnectedError } =
      await import("./BingService");

    await expect(
      BingService.getCrawlStats({ projectId: "p1" }),
    ).rejects.toBeInstanceOf(BingNotConnectedError);
  });

  it("sorts rows by date ascending and drops undated rows", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);
    mocks.getCrawlStats.mockResolvedValue([
      crawlRow("2026-07-02T00:00:00.000Z", 51),
      crawlRow(null, 999),
      crawlRow("2026-07-01T00:00:00.000Z", 50),
    ]);
    const { BingService } = await import("./BingService");

    const result = await BingService.getCrawlStats({ projectId: "p1" });

    expect(result.siteUrl).toBe("https://x.example/");
    expect(result.rows.map((row) => row.inIndex)).toEqual([50, 51]);
  });
});

describe("BingService.inspectUrls", () => {
  const urlInfo = (url: string) => ({
    url,
    known: true,
    discoveredAt: "2026-04-25T07:00:00.000Z",
    lastCrawledAt: "2026-07-29T09:13:45.000Z",
    documentSize: 1000,
    isPage: true,
    anchorCount: 0,
    totalChildUrlCount: 0,
  });

  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getUrlInfo.mockReset();
    mocks.createBingClient.mockClear();
  });

  it("throws BingNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingService, BingNotConnectedError } =
      await import("./BingService");

    await expect(
      BingService.inspectUrls({ projectId: "p1", urls: ["https://x/"] }),
    ).rejects.toBeInstanceOf(BingNotConnectedError);
  });

  it("inspects each URL against the connected site and tolerates per-URL failures", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);
    mocks.getUrlInfo.mockImplementation((_site: string, url: string) => {
      if (url.includes("boom")) {
        return Promise.reject(new Error("Bing Webmaster API error (500)"));
      }
      return Promise.resolve(urlInfo(url));
    });
    const { BingService } = await import("./BingService");

    const { siteUrl, results } = await BingService.inspectUrls({
      projectId: "p1",
      urls: ["https://x.example/a", "https://x.example/boom"],
    });

    expect(siteUrl).toBe("https://x.example/");
    expect(results[0]).toMatchObject({
      url: "https://x.example/a",
      known: true,
    });
    expect(results[1]).toMatchObject({
      url: "https://x.example/boom",
      error: expect.stringContaining("500"),
    });
    expect(mocks.getUrlInfo).toHaveBeenCalledWith(
      "https://x.example/",
      "https://x.example/a",
    );
  });
});
