import { beforeEach, describe, expect, it, vi } from "vitest";
import { UmamiReportingService } from "./UmamiReportingService";

type Range = { startAt: number; endAt: number };

const mocks = vi.hoisted(() => ({
  openConnection: vi.fn(),
  getStats: vi.fn(),
  getSeries:
    vi.fn<
      (
        websiteId: string,
        range: Range,
        input: { unit: string; timeZone: string; referrer?: string },
      ) => Promise<unknown>
    >(),
  getExpandedMetrics:
    vi.fn<
      (
        websiteId: string,
        range: Range,
        input: { type: string; limit: number; offset: number },
      ) => Promise<unknown>
    >(),
}));

vi.mock("@/server/features/umami/services/UmamiService", () => ({
  UmamiService: { openConnection: mocks.openConnection },
}));

function metric(name: string, visits: number, extra = {}) {
  return {
    name,
    visits,
    visitors: visits,
    pageviews: visits,
    bounces: 0,
    totaltime: 0,
    ...extra,
  };
}

describe("UmamiReportingService", () => {
  beforeEach(() => {
    mocks.openConnection.mockResolvedValue({
      connection: {
        websiteId: "w1",
        websiteName: "Site",
        websiteDomain: "a.com",
        timeZone: "Europe/Amsterdam",
      },
      instance: { baseUrl: "https://stats.example.com" },
      client: {
        getStats: mocks.getStats,
        getSeries: mocks.getSeries,
        getExpandedMetrics: mocks.getExpandedMetrics,
      },
    });
    mocks.getSeries.mockResolvedValue({ pageviews: [], sessions: [] });
    mocks.getExpandedMetrics.mockResolvedValue([]);
  });

  it("reads whole local days across a DST change and zero-fills the trend", async () => {
    mocks.getSeries.mockResolvedValue({
      pageviews: [{ x: "2026-10-25T00:00:00Z", y: 7 }],
      sessions: [{ x: "2026-10-25T00:00:00Z", y: 3 }],
    });

    const result = await UmamiReportingService.getOverview(
      { projectId: "p1" },
      { now: new Date("2026-10-30T12:00:00Z") },
    );

    expect(result.request.resolvedDateRange).toEqual({
      startDate: "2026-10-02",
      endDate: "2026-10-29",
    });
    // Amsterdam is UTC+2 on Oct 2 and UTC+1 after Oct 25.
    expect(mocks.getSeries.mock.calls[0][1]).toEqual({
      startAt: Date.parse("2026-10-01T22:00:00Z"),
      endAt: Date.parse("2026-10-29T23:00:00Z") - 1,
    });
    expect(result.trend).toHaveLength(28);
    // Under the organic filter only entry pageviews match, so the trend
    // carries visitors and leaves pageviews to the totals.
    expect(result.trend.find((day) => day.date === "2026-10-25")).toEqual({
      date: "2026-10-25",
      visitors: 3,
      pageviews: null,
    });
  });

  it("takes organic totals from Umami's per-visit organicSearch channel", async () => {
    mocks.getExpandedMetrics.mockResolvedValue([
      metric("direct", 50),
      metric("organicSearch", 4, { pageviews: 12, bounces: 1, totaltime: 400 }),
    ]);

    const result = await UmamiReportingService.getOverview({ projectId: "p1" });

    expect(mocks.getStats).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      visits: 4,
      visitors: 4,
      pageviews: 12,
      bounceRate: 0.25,
      avgVisitDurationSeconds: 100,
    });
  });

  it("limits organic entry pages to search-engine referrers", async () => {
    await UmamiReportingService.getOverview({ projectId: "p1" });

    const filter = mocks.getSeries.mock.calls[0][2].referrer;
    if (typeof filter !== "string") throw new Error("expected a filter");
    expect(filter.startsWith("re.")).toBe(true);
    // Umami runs it as a case-insensitive Postgres or RE2 regex.
    const search = new RegExp(filter.slice(3), "i");
    for (const domain of [
      "google.com",
      "www.google.co.th",
      "cn.bing.com",
      "uk.search.yahoo.com",
      "search.brave.com",
      "duckduckgo.com",
      "com.google.android.googlequicksearchbox",
    ]) {
      expect(search.test(domain), domain).toBe(true);
    }
    for (const domain of [
      "gemini.google.com",
      "news.google.com",
      "mail.google.com",
      "chatgpt.com",
      "example.com",
    ]) {
      expect(search.test(domain), domain).toBe(false);
    }
  });

  it("asks for a monthly trend once Umami would stop answering daily", async () => {
    mocks.getSeries.mockResolvedValue({
      pageviews: [],
      sessions: [{ x: "2026-03-01T00:00:00Z", y: 40 }],
    });

    const result = await UmamiReportingService.getOverview({
      projectId: "p1",
      startDate: "2026-01-01",
      endDate: "2026-09-30",
    });

    expect(mocks.getSeries.mock.calls[0][2].unit).toBe("month");
    expect(result.request.trend).toBe("monthly");
    expect(result.trend.map((row) => row.date)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(result.trend[2].visitors).toBe(40);
  });

  it("pages entry pages with one look-ahead row", async () => {
    mocks.getExpandedMetrics.mockResolvedValue([
      metric("/a", 5),
      metric("/b", 3),
    ]);

    const result = await UmamiReportingService.runReport({
      projectId: "p1",
      kind: "landing_pages",
      limit: 1,
    });

    expect(result.rows).toEqual([
      { landingPage: "/a", visits: 5, visitors: 5 },
    ]);
    expect(result.pageInfo).toEqual({ limit: 1, offset: 0, hasMore: true });
    expect(mocks.getExpandedMetrics.mock.calls[0][2]).toMatchObject({
      type: "entry",
      limit: 2,
      offset: 0,
    });
  });

  // Umami's channel route ignores limit and offset and returns every channel.
  it("pages the unfiltered channel split itself", async () => {
    mocks.getExpandedMetrics.mockResolvedValue([
      metric("direct", 9),
      metric("organicSearch", 5),
      metric("referral", 2),
    ]);

    const result = await UmamiReportingService.runReport({
      projectId: "p1",
      kind: "channels",
      channel: "organic_search",
      limit: 1,
      offset: 1,
    });

    expect(result.request.channel).toBe("all");
    expect(result.rows).toEqual([
      { channel: "organicSearch", visits: 5, visitors: 5, pageviews: 5 },
    ]);
    expect(result.pageInfo.hasMore).toBe(true);
    expect(mocks.getExpandedMetrics.mock.calls[0][2]).not.toHaveProperty(
      "referrer",
    );
  });
});
