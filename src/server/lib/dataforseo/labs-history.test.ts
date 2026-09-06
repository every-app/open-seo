import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDomainHistoricalRankOverview } from "@/server/lib/dataforseo/labs";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

describe("DataForSEO historical rank overview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests correlated monthly history without clickstream pricing", async () => {
    const path = [
      "v3",
      "dataforseo_labs",
      "google",
      "historical_rank_overview",
      "live",
    ];
    const item = {
      year: 2026,
      month: 8,
      metrics: { organic: { etv: 1234.5, count: 456 } },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path,
            cost: 0.1488,
            result_count: 1,
            result: [{ items: [item] }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDomainHistoricalRankOverview({
      target: "example.com",
      locationCode: 2392,
      languageCode: "ja",
      dateFrom: "2024-09-01",
      dateTo: "2026-09-06",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live",
    );
    expect(parseRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      {
        target: "example.com",
        location_code: 2392,
        language_code: "ja",
        date_from: "2024-09-01",
        date_to: "2026-09-06",
        correlate: true,
        include_clickstream_data: false,
      },
    ]);
    expect(result).toEqual({
      data: [item],
      billing: { path, costUsd: 0.1488 },
    });
  });
});

function parseRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected request body to be a string");
  }
  return JSON.parse(init.body) as unknown;
}
