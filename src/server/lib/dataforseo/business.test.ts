import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchBusinessDataTaskResult,
  fetchBusinessListingsCategories,
  fetchMyBusinessInfo,
  postGoogleReviewsTask,
} from "@/server/lib/dataforseo/business";

function stubDataforseo(payload: unknown) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestOf(fetchMock: ReturnType<typeof stubDataforseo>) {
  const [url, init] = fetchMock.mock.calls[0];
  const rawUrl = typeof url === "string" || url instanceof URL ? url : url.url;
  const body = init?.body;
  return {
    url: rawUrl.toString(),
    body: typeof body === "string" ? (JSON.parse(body) as unknown) : null,
  };
}

const okTask = (path: string[], result: unknown[]) => ({
  status_code: 20000,
  tasks: [{ status_code: 20000, path, cost: 0.002, result }],
});

describe("Google business_data fetchers", () => {
  it("sends a coordinate for my_business_info and returns the single item", async () => {
    const fetchMock = stubDataforseo(
      okTask(
        ["v3", "business_data", "google", "my_business_info", "live"],
        [{ items: [{ title: "Acme Cafe", is_claimed: true }] }],
      ),
    );

    const result = await fetchMyBusinessInfo({
      keyword: "cid:123",
      locationCoordinate: "33.1234568,-84.9876543,5000",
      locationCode: 2840,
      languageCode: "en",
    });

    const { url, body } = requestOf(fetchMock);
    expect(url).toBe(
      "https://api.dataforseo.com/v3/business_data/google/my_business_info/live",
    );
    // The coordinate wins: DataForSEO rejects a request carrying both.
    expect(body).toEqual([
      {
        keyword: "cid:123",
        location_coordinate: "33.1234568,-84.9876543,5000",
        language_code: "en",
      },
    ]);
    expect(result.data).toEqual({ title: "Acme Cafe", is_claimed: true });
    expect(result.billing.costUsd).toBe(0.002);
  });

  it("falls back to location_code and treats no-results as an empty success", async () => {
    const fetchMock = stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          status_code: 40501,
          status_message: "No Search Results.",
          path: ["v3", "business_data", "google", "my_business_info", "live"],
          cost: 0.002,
        },
      ],
    });

    const result = await fetchMyBusinessInfo({
      keyword: "Nowhere Cafe",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(requestOf(fetchMock).body).toEqual([
      {
        keyword: "Nowhere Cafe",
        location_code: 2840,
        language_code: "en",
      },
    ]);
    expect(result.data).toBeNull();
    // DataForSEO charges for an empty result, so it still has to be metered.
    expect(result.billing.costUsd).toBe(0.002);
  });

  it.each([
    {
      includeOtherSources: false,
      endpoint: "reviews",
      // The extended endpoint has no sort_by; the fetcher drops it.
      sortBy: { sort_by: "newest" },
    },
    { includeOtherSources: true, endpoint: "extended_reviews", sortBy: {} },
  ])(
    "posts reviews to $endpoint when includeOtherSources=$includeOtherSources and bills from the post entry",
    async ({ includeOtherSources, endpoint, sortBy }) => {
      const path = ["v3", "business_data", "google", endpoint, "task_post"];
      const fetchMock = stubDataforseo({
        status_code: 20000,
        tasks: [{ id: "task-1", status_code: 20100, cost: 0.00375, path }],
      });

      const result = await postGoogleReviewsTask({
        cid: "123",
        locationCode: 2840,
        languageCode: "en",
        depth: 20,
        sortBy: "newest",
        includeOtherSources,
      });

      const { url, body } = requestOf(fetchMock);
      expect(url).toBe(`https://api.dataforseo.com/${path.join("/")}`);
      expect(body).toEqual([
        {
          cid: "123",
          location_code: 2840,
          language_code: "en",
          depth: 20,
          priority: 2,
          ...sortBy,
        },
      ]);
      expect(result).toEqual({
        data: "task-1",
        billing: { path, costUsd: 0.00375 },
      });
    },
  );

  it("never replays a task_post on a 5xx (a retry could double-charge)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postGoogleReviewsTask({
        cid: "123",
        locationCode: 2840,
        languageCode: "en",
        depth: 20,
        sortBy: "newest",
        includeOtherSources: false,
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a queued task as pending instead of failing", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [{ status_code: 40602, status_message: "Task In Queue." }],
    });

    await expect(
      fetchBusinessDataTaskResult({ endpoint: "reviews", taskId: "task-1" }),
    ).resolves.toEqual({ status: "pending", result: null });
  });

  it("maps the free categories list onto category/businessCount rows", async () => {
    stubDataforseo(
      okTask(
        ["v3", "business_data", "business_listings", "categories"],
        [
          { category_name: "pizza_restaurant", business_count: 12 },
          { category_name: "plumber" },
        ],
      ),
    );

    const result = await fetchBusinessListingsCategories();

    expect(result.data).toEqual([
      { category: "pizza_restaurant", businessCount: 12 },
      { category: "plumber", businessCount: null },
    ]);
  });
});
