import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {
    DATAFORSEO_API_KEY: "encoded-key",
  },
}));

describe("DataForSEO raw wrappers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("uses the live endpoint for Google Business Q&A", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: [
              "v3",
              "business_data",
              "google",
              "questions_and_answers",
              "live",
            ],
            cost: 0.0006,
            result_count: 1,
            result: [
              {
                items: [
                  {
                    question_text: "Do you offer indoor storage?",
                    answer_text: "Yes.",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchBusinessQuestionsAnswersRaw } = await import("./dataforseo");
    const result = await fetchBusinessQuestionsAnswersRaw({
      keyword: "Acme Storage",
      locationCoordinate: "33.1234568,-84.9876543,5000",
      languageCode: "en",
      depth: 20,
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual([
      "https://api.dataforseo.com/v3/business_data/google/questions_and_answers/live",
    ]);
    expect(result.data).toEqual([
      {
        question_text: "Do you offer indoor storage?",
        answer_text: "Yes.",
      },
    ]);
    expect(result.billing).toEqual({
      path: ["v3", "business_data", "google", "questions_and_answers", "live"],
      costUsd: 0.0006,
      resultCount: 1,
    });
  });

  it("does not send location_name for keyword search volume", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: [
              "v3",
              "keywords_data",
              "google_ads",
              "search_volume",
              "live",
            ],
            cost: 0.0001,
            result_count: 1,
            result: [
              {
                items: [
                  {
                    keyword: "storage units",
                    location_code: 2840,
                    language_code: "en",
                    search_volume: 1000,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchKeywordSearchVolumeRaw } = await import("./dataforseo");
    await fetchKeywordSearchVolumeRaw({
      keywords: ["storage units"],
      locationCode: 2840,
      languageCode: "en",
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(typeof init?.body).toBe("string");
    const body = init?.body;
    if (typeof body !== "string") {
      throw new Error("Expected DataForSEO request body to be a string");
    }
    const payload = JSON.parse(body) as unknown;
    expect(payload).toEqual([
      {
        keywords: ["storage units"],
        location_code: 2840,
        language_code: "en",
      },
    ]);
    expect(JSON.stringify(payload)).not.toContain("location_name");
  });
});
