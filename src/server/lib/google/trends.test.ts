import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleTrend } from "./trends";

describe("Google Trends adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses timeline data and caches identical requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          String.raw`)]}'
{"widgets":[{"id":"TIMESERIES","token":"token","request":{}},{"id":"RELATED_QUERIES","token":"related-token","request":{}}]}`,
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          String.raw`)]}'
{"default":{"timelineData":[{"time":"1704067200","value":[42]}]}}`,
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          String.raw`)]}'
{"default":{"rankedList":[{"rankedKeyword":[{"keyword":"seo tools","value":100},{"keyword":"seo audit","value":80}]}]}}`,
          { status: 200 },
        ),
      );

    const first = await fetchGoogleTrend({ keyword: "fixture-seo-test-1" });
    const second = await fetchGoogleTrend({ keyword: "fixture-seo-test-1" });

    expect(first.points[0]).toEqual({
      date: "2024-01-01T00:00:00.000Z",
      value: 42,
    });
    expect(second).toEqual(first);
    expect(first.relatedQueries).toEqual([
      { query: "seo tools", value: 100 },
      { query: "seo audit", value: 80 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries transient rate limits", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          String.raw`)]}'
{"widgets":[{"id":"TIMESERIES","token":"token","request":{}}]}`,
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          String.raw`)]}'
{"default":{"timelineData":[]}}`,
          { status: 200 },
        ),
      );

    const result = await fetchGoogleTrend({ keyword: "fixture-seo-test-2" });

    expect(result.points).toEqual([]);
    expect(result.relatedQueries).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
