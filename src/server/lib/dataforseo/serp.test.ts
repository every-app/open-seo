import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchRankCheckTaskResult,
  postRankCheckTasks,
} from "@/server/lib/dataforseo/serp";
import {
  fetchLocalGridTaskResult,
  postLocalGridTasks,
} from "@/server/lib/dataforseo/serp-local-grid";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("rank check task queue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts queued tasks, maps ids by tag, and sums cost over all entries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:desktop" },
          },
          {
            id: "task-b",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:mobile" },
          },
          {
            id: "task-c",
            status_code: 40006,
            status_message: "Task Limit Exceeded",
            cost: 0.0006,
            data: { tag: "kw-2:desktop" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postRankCheckTasks({
      tasks: [
        { keyword: "alpha", keywordId: "kw-1", device: "desktop" },
        { keyword: "alpha", keywordId: "kw-1", device: "mobile" },
        { keyword: "beta", keywordId: "kw-2", device: "desktop" },
      ],
      locationCode: 2840,
      languageCode: "en",
      depth: 20,
      targetDomain: "example.com",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual(["https://api.dataforseo.com/v3/serp/google/organic/task_post"]);

    // Every posted task asks DataForSEO to stop crawling at the target's
    // organic listing — that is what cuts the actual crawl cost for ranking
    // domains without false "not ranking" stops on sitelinks/PAA mentions.
    const stopCrawl = {
      stop_crawl_on_match: [
        { match_value: "example.com", match_type: "with_subdomains" },
      ],
      find_targets_in: ["organic"],
    };
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([stopCrawl, stopCrawl, stopCrawl]);
    expect(result.data).toEqual([
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "desktop",
        taskId: "task-a",
      },
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "mobile",
        taskId: "task-b",
      },
    ]);
    // The rejected entry's cost is still metered: a charge is a charge.
    expect(result.billing.costUsd).toBeCloseTo(0.0018, 10);
    expect(result.billing.path).toEqual([
      "v3",
      "serp",
      "google",
      "organic",
      "task_post",
    ]);
  });

  it("reports a queued task still in progress as pending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [{ id: "task-a", status_code: 40602 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
    });

    expect(outcome).toEqual({ status: "pending" });
  });

  it("parses a completed queued task into a rank check result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20000,
            cost: 0,
            path: ["v3", "serp", "google", "organic", "task_get", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "organic",
                    rank_group: 3,
                    rank_absolute: 4,
                    domain: "www.example.com",
                    url: "https://www.example.com/page",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
    });

    expect(outcome).toEqual({
      status: "completed",
      result: {
        keywordId: "kw-1",
        keyword: "alpha",
        position: 3,
        url: "https://www.example.com/page",
        serpFeatures: ["organic"],
      },
    });
  });
});

describe("local grid Maps task queue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts coordinate tasks with stable result tags and sums provider cost", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "maps-task-a",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "result-a" },
          },
          {
            id: "maps-task-b",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "result-b" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postLocalGridTasks({
      tasks: [
        {
          resultId: "result-a",
          pointId: "point-a",
          keywordId: "keyword-a",
          keyword: "loft conversions",
          locationCoordinate: "50.8179000,-0.3729000,14z",
        },
        {
          resultId: "result-b",
          pointId: "point-b",
          keywordId: "keyword-a",
          keyword: "loft conversions",
          locationCoordinate: "50.8279000,-0.3729000,14z",
        },
      ],
      languageCode: "en",
      seDomain: null,
      depth: 20,
      searchPlaces: false,
    });

    const request = fetchMock.mock.calls[0]?.[0];
    const requestUrl =
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.href
          : request?.url;
    expect(requestUrl).toContain("/v3/serp/google/maps/task_post");
    const requestBody = parseDataforseoRequestBody(
      fetchMock.mock.calls[0]?.[1],
    );
    expect(requestBody).toEqual([
      expect.objectContaining({
        keyword: "loft conversions",
        location_coordinate: "50.8179000,-0.3729000,14z",
        search_this_area: true,
        search_places: false,
        priority: 1,
        tag: "result-a",
      }),
      expect.objectContaining({ tag: "result-b" }),
    ]);
    expect(JSON.stringify(requestBody)).not.toContain('"se_domain"');
    expect(
      result.data.map((task) => ({
        taskId: task.taskId,
        costUsd: task.costUsd,
      })),
    ).toEqual([
      { taskId: "maps-task-a", costUsd: 0.0006 },
      { taskId: "maps-task-b", costUsd: 0.0006 },
    ]);
    expect(result.billing).toEqual({
      path: ["v3", "serp", "google", "maps", "task_post"],
      costUsd: 0.0012,
    });
  });

  it("parses rankings and matches the target by stable identifier priority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              id: "maps-task-a",
              status_code: 20000,
              result: [
                {
                  items: [
                    {
                      type: "maps_search",
                      rank_group: 1,
                      title: "Competitor",
                      place_id: "competitor-place",
                      cid: "competitor-cid",
                      rating: { value: 4.9, votes_count: 300 },
                    },
                    {
                      type: "maps_search",
                      rank_group: 2,
                      title: "Target business",
                      place_id: "target-place",
                      cid: "target-cid",
                      feature_id: "target-feature",
                      address: "Worthing, UK",
                      phone: "01903 000000",
                      url: "https://example.com",
                      category: "Loft conversion service",
                      latitude: 50.8179,
                      longitude: -0.3729,
                      rating: { value: 4.8, votes_count: 42 },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );

    const outcome = await fetchLocalGridTaskResult({
      taskId: "maps-task-a",
      resultId: "result-a",
      pointId: "point-a",
      keywordId: "keyword-a",
      keyword: "loft conversions",
      locationCoordinate: "50.8179000,-0.3729000,14z",
      target: {
        placeId: "target-place",
        cid: "target-cid",
        featureId: "target-feature",
      },
    });

    expect(outcome).toEqual({
      status: "completed",
      result: {
        resultId: "result-a",
        pointId: "point-a",
        keywordId: "keyword-a",
        keyword: "loft conversions",
        targetRank: 2,
        matchedBy: "place_id",
        rankings: [
          expect.objectContaining({
            rank: 1,
            name: "Competitor",
            reviewCount: 300,
          }),
          expect.objectContaining({
            rank: 2,
            name: "Target business",
            placeId: "target-place",
            rating: 4.8,
            reviewCount: 42,
          }),
        ],
      },
    });
  });

  it("returns pending without attempting to parse incomplete results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [{ id: "maps-task-a", status_code: 40602 }],
        }),
      ),
    );

    await expect(
      fetchLocalGridTaskResult({
        taskId: "maps-task-a",
        resultId: "result-a",
        pointId: "point-a",
        keywordId: "keyword-a",
        keyword: "loft conversions",
        locationCoordinate: "50.8179000,-0.3729000,14z",
        target: { placeId: "target-place" },
      }),
    ).resolves.toEqual({ status: "pending" });
  });
});
