import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchBingInboundLinkCounts,
  fetchBingQueryStats,
  fetchBingUserSites,
  getBingPartialOverview,
} from "./bing-site";

const JSON_HEADERS = { headers: { "content-type": "application/json" } };

describe("Bing Webmaster site-data adapter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses registered sites from the fixture response", async () => {
    vi.stubEnv("BING_WEBMASTER_API_KEY", "fixture-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ d: [{ Url: "https://example.com/" }] }), {
        status: 200,
        ...JSON_HEADERS,
      }),
    );

    expect(await fetchBingUserSites()).toEqual(["https://example.com/"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aggregates inbound link counts and top sources", async () => {
    vi.stubEnv("BING_WEBMASTER_API_KEY", "fixture-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          d: [
            {
              Source: "https://partner.example.com/links",
              LinkCount: { SourcedDomains: 4, Backlinks: 120 },
            },
            {
              Source: "https://news.example.org/post",
              LinkCount: { SourcedDomains: 2, Backlinks: 30 },
            },
          ],
        }),
        { status: 200, ...JSON_HEADERS },
      ),
    );

    expect(await fetchBingInboundLinkCounts("example.com")).toEqual({
      sourcedDomains: 6,
      backlinks: 150,
      topSources: [
        { source: "https://partner.example.com/links", backlinks: 120 },
        { source: "https://news.example.org/post", backlinks: 30 },
      ],
    });
  });

  it("aggregates query stats by query and computes ctr", async () => {
    vi.stubEnv("BING_WEBMASTER_API_KEY", "fixture-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          d: [
            {
              Query: "seo audit",
              Impressions: 100,
              Clicks: 10,
              AvgImpressionPosition: 5,
              Date: "1/1",
            },
            {
              Query: "seo audit",
              Impressions: 50,
              Clicks: 5,
              AvgImpressionPosition: 3,
              Date: "1/2",
            },
            {
              Query: "backlinks",
              Impressions: 40,
              Clicks: 1,
              AvgImpressionPosition: null,
              Date: "1/1",
            },
          ],
        }),
        { status: 200, ...JSON_HEADERS },
      ),
    );

    // avgImpressionPosition is the impression-weighted mean across rows:
    // (5*100 + 3*50) / 150 = 4.33. Rows without a position contribute none.
    expect(await fetchBingQueryStats("example.com")).toEqual([
      {
        query: "seo audit",
        impressions: 150,
        clicks: 15,
        ctr: 0.1,
        avgImpressionPosition: 4.33,
      },
      {
        query: "backlinks",
        impressions: 40,
        clicks: 1,
        ctr: 0.025,
        avgImpressionPosition: null,
      },
    ]);
  });

  it("returns null when Bing credentials are missing", async () => {
    vi.stubEnv("BING_WEBMASTER_API_KEY", "");
    expect(await getBingPartialOverview("example.com")).toBeNull();
  });
});
