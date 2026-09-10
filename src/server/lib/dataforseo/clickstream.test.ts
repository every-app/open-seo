import { describe, expect, it, vi } from "vitest";

const { dataforseoPostMock } = vi.hoisted(() => ({
  dataforseoPostMock: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  dataforseoPost: dataforseoPostMock,
}));

import { fetchGlobalSearchVolume } from "./clickstream";

describe("fetchGlobalSearchVolume", () => {
  it("posts one clickstream task and normalizes worldwide rows", async () => {
    dataforseoPostMock.mockResolvedValue({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          status_code: 20000,
          status_message: "Ok.",
          path: [
            "v3",
            "keywords_data",
            "clickstream_data",
            "global_search_volume",
            "live",
          ],
          cost: 0.15,
          result: [
            {
              items_count: 2,
              items: [
                {
                  keyword: "best hiking trails in the world",
                  search_volume: 8800,
                  country_distribution: [
                    {
                      country_iso_code: "US",
                      search_volume: 1900,
                      percentage: 21.5909,
                    },
                  ],
                },
                {
                  keyword: "best cycling routes in the world",
                  search_volume: 4200,
                  country_distribution: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchGlobalSearchVolume({
      keywords: [
        "best hiking trails in the world",
        "best cycling routes in the world",
      ],
    });

    expect(dataforseoPostMock).toHaveBeenCalledWith(
      "/v3/keywords_data/clickstream_data/global_search_volume/live",
      [
        {
          keywords: [
            "best hiking trails in the world",
            "best cycling routes in the world",
          ],
        },
      ],
    );
    expect(result).toEqual({
      data: [
        {
          keyword: "best hiking trails in the world",
          searchVolume: 8800,
          countryDistribution: [
            {
              countryIsoCode: "US",
              searchVolume: 1900,
              percentage: 21.5909,
            },
          ],
        },
        {
          keyword: "best cycling routes in the world",
          searchVolume: 4200,
          countryDistribution: [],
        },
      ],
      billing: {
        path: [
          "v3",
          "keywords_data",
          "clickstream_data",
          "global_search_volume",
          "live",
        ],
        costUsd: 0.15,
      },
    });
  });

  it("rejects a provider response with an invalid country distribution", async () => {
    dataforseoPostMock.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          path: [
            "v3",
            "keywords_data",
            "clickstream_data",
            "global_search_volume",
            "live",
          ],
          cost: 0.15,
          result: [
            {
              items: [
                {
                  keyword: "trail",
                  search_volume: 100,
                  country_distribution: [
                    {
                      country_iso_code: "USA",
                      search_volume: 100,
                      percentage: 100,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    await expect(
      fetchGlobalSearchVolume({ keywords: ["trail"] }),
    ).rejects.toThrow("invalid response shape");
  });
});
