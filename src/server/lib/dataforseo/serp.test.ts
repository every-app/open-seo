import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import {
  fetchLiveSerp,
  fetchLocalSerpTaskResult,
  fetchRankCheckTaskResult,
  postLocalSerpTasks,
  postRankCheckTasks,
} from "@/server/lib/dataforseo/serp";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("live SERP", () => {
  // 40102 is the documented "No Search Results." code (40501 is "Invalid
  // Field."). isNoResultsTask matches on the status message, not the code, so
  // this stays correct whichever code DataForSEO attaches to the message.
  it("returns an empty result for DataForSEO's no-results task", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 40102,
              status_message: "No Search Results.",
              path: ["v3", "serp", "google", "organic", "live", "advanced"],
              cost: 0.002,
              result_count: 0,
              result: [],
            },
          ],
        }),
      ),
    );

    await expect(
      fetchLiveSerp({
        keyword: "obscure query",
        locationCode: 2840,
        languageCode: "en",
      }),
    ).resolves.toMatchObject({
      data: [],
      billing: { costUsd: 0.002 },
    });
  });
});

describe("rank check task queue", () => {
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

describe("Maps task queue", () => {
  it("posts one task per coordinate, maps ids back by tag, and bills every entry", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-c",
            status_code: 20100,
            cost: 0.0012,
            data: { tag: "2" },
          },
          {
            status_code: 40501,
            status_message: "Invalid Field",
            cost: 0.0006,
            data: { tag: "1" },
          },
          {
            id: "task-a",
            status_code: 20100,
            cost: 0.0012,
            data: { tag: "0" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await postLocalSerpTasks({
      keyword: "coffee",
      locationCoordinates: ["1,1,13z", "2,2,13z", "3,3,13z"],
      languageCode: "en",
      device: "mobile",
      depth: 20,
    });

    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([
      { location_coordinate: "1,1,13z", priority: 2, tag: "0" },
      { location_coordinate: "2,2,13z", priority: 2, tag: "1" },
      { location_coordinate: "3,3,13z", priority: 2, tag: "2" },
    ]);
    expect(result.data).toEqual(["task-a", null, "task-c"]);
    // The rejected entry's cost is still metered: a charge is a charge.
    expect(result.billing.costUsd).toBeCloseTo(0.003, 10);
  });

  it("keeps DataForSEO's charge when it rejects every entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 40501,
              status_message: "Invalid Field: 'location_coordinate'.",
              cost: 0.0012,
              data: { tag: "0" },
            },
          ],
        }),
      ),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const posting = postLocalSerpTasks({
      keyword: "coffee",
      locationCoordinates: ["1,1,13z"],
      languageCode: "en",
      device: "mobile",
      depth: 20,
    });
    // The meter bills a failure only when it is a charged-task error.
    await expect(posting).rejects.toBeInstanceOf(DataforseoChargedTaskError);
    await expect(posting).rejects.toMatchObject({
      billing: { costUsd: 0.0012 },
    });
  });

  it("reads a queued Maps task as pending, its items once done, and No Search Results as an empty SERP", async () => {
    const items = [{ type: "maps_search", rank_absolute: 1, cid: "123" }];
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            status_code: 20000,
            tasks: [{ status_code: 40602 }],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            status_code: 20000,
            tasks: [{ status_code: 20000, result: [{ items }] }],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            status_code: 20000,
            tasks: [
              { status_code: 40102, status_message: "No Search Results." },
            ],
          }),
        ),
    );

    expect(await fetchLocalSerpTaskResult("task-a")).toEqual({
      status: "pending",
    });
    expect(await fetchLocalSerpTaskResult("task-a")).toEqual({
      status: "completed",
      items,
    });
    expect(await fetchLocalSerpTaskResult("task-b")).toEqual({
      status: "completed",
      items: [],
    });
  });
});
