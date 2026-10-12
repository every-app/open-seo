import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

// Skip the live model-catalog fetch (covered in llm-models.test.ts); the
// unknown "claude-sonnet-4-0" keeps the reject-before-dispatch test honest.
vi.mock("@/server/lib/dataforseo/llm-models", () => ({
  isKnownLlmModelName: vi.fn(
    async (_slug: string, name: string) => name !== "claude-sonnet-4-0",
  ),
}));

import { fetchQuestionsAnswers } from "@/server/lib/dataforseo/business";
import {
  fetchLlmCrossAggregatedMetrics,
  fetchLlmResponse,
} from "@/server/lib/dataforseo/ai";
import { buildLlmTarget } from "@/server/lib/dataforseo/shared";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("DataForSEO SDK-backed endpoints", () => {
  it("uses the live endpoint for Google Business Q&A and returns items + billing", async () => {
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

    const result = await fetchQuestionsAnswers({
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
      { question_text: "Do you offer indoor storage?", answer_text: "Yes." },
    ]);
    expect(result.billing).toEqual({
      path: ["v3", "business_data", "google", "questions_and_answers", "live"],
      costUsd: 0.0006,
    });
  });

  it("serializes cross-aggregated target groups", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: [
              "v3",
              "ai_optimization",
              "llm_mentions",
              "cross_aggregated_metrics",
              "live",
            ],
            cost: 0.0001,
            result_count: 1,
            result: [{ items: [] }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchLlmCrossAggregatedMetrics({
      groups: [
        {
          key: "example.com",
          target: buildLlmTarget({ type: "domain", value: "example.com" }),
        },
        {
          key: "Acme Storage",
          target: buildLlmTarget({ type: "keyword", value: "Acme Storage" }),
        },
      ],
      platform: "google",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      {
        targets: [
          {
            aggregation_key: "example.com",
            target: [
              {
                search_scope: ["any"],
                search_filter: "include",
                domain: "example.com",
                include_subdomains: true,
              },
            ],
          },
          {
            aggregation_key: "Acme Storage",
            target: [
              {
                search_scope: ["any", "brand_entities"],
                search_filter: "include",
                keyword: "Acme Storage",
                match_type: "word_match",
              },
            ],
          },
        ],
        location_code: 2840,
        language_code: "en",
        platform: "google",
        internal_list_limit: 5,
      },
    ]);
  });

  it("drops the search country when web search is off — DataForSEO rejects it", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: [
              "v3",
              "ai_optimization",
              "perplexity",
              "llm_responses",
              "live",
            ],
            cost: 0.0001,
            result_count: 1,
            result: [
              {
                model_name: "sonar",
                output_tokens: 12,
                web_search: false,
                items: [],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchLlmResponse({
      userPrompt: "What is OpenSEO?",
      modelSlug: "perplexity",
      modelName: "sonar",
      webSearch: false,
      webSearchCountryCode: "US",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual([
      "https://api.dataforseo.com/v3/ai_optimization/perplexity/llm_responses/live",
    ]);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      {
        user_prompt: "What is OpenSEO?",
        model_name: "sonar",
        web_search: false,
        max_output_tokens: 1024,
      },
    ]);
  });
});

const okLlmResponse = () =>
  Response.json({
    status_code: 20000,
    tasks: [{ status_code: 20000, path: ["v3"], cost: 0.001, result: [{}] }],
  });

describe("fetchLlmResponse force_web_search", () => {
  it("sends it only for Claude — ChatGPT rejects it with a 40501 Invalid Field", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(okLlmResponse())
      .mockResolvedValueOnce(okLlmResponse());
    vi.stubGlobal("fetch", fetchMock);

    const base = { userPrompt: "What is OpenSEO?", webSearch: true } as const;
    const claude = {
      modelSlug: "claude",
      modelName: "claude-sonnet-4-6",
    } as const;
    const chatGpt = {
      modelSlug: "chat_gpt",
      modelName: "gpt-5",
      webSearchCountryCode: "US",
    } as const;
    await fetchLlmResponse({ ...base, ...claude });
    await fetchLlmResponse({ ...base, ...chatGpt });

    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      {
        user_prompt: "What is OpenSEO?",
        model_name: "claude-sonnet-4-6",
        web_search: true,
        force_web_search: true,
        max_output_tokens: 1024,
      },
    ]);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[1]?.[1])).toEqual([
      {
        user_prompt: "What is OpenSEO?",
        model_name: "gpt-5",
        web_search: true,
        max_output_tokens: 1024,
        web_search_country_iso_code: "US",
      },
    ]);
  });
});

describe("fetchLlmResponse model_name validation", () => {
  it("rejects an unknown model_name before dispatching a paid LLM task", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLlmResponse({
        userPrompt: "What is OpenSEO?",
        modelSlug: "claude",
        // DataForSEO dropped this from its catalog; it must never be dispatched.
        modelName: "claude-sonnet-4-0",
      }),
    ).rejects.toThrow(/Unsupported DataForSEO model_name/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("LLM response country requests", () => {
  it.each([
    ["chat_gpt", "gpt-5", "BG"],
    ["perplexity", "sonar", "BG"],
    ["claude", "claude-sonnet-4-6", "FI"],
  ] as const)(
    "sends the Bulgarian prompt and supported %s country hint unchanged",
    async (modelSlug, modelName, country) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(okLlmResponse());
      vi.stubGlobal("fetch", fetchMock);
      const prompt =
        "Кое студио в София бихте препоръчали за PPF защитно фолио?";
      await fetchLlmResponse({
        userPrompt: prompt,
        modelSlug,
        modelName,
        webSearch: true,
        webSearchCountryCode: country,
      });
      expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
        expect.objectContaining({
          user_prompt: prompt,
          web_search_country_iso_code: country,
        }),
      ]);
    },
  );

  it.each([
    ["claude", "claude-sonnet-4-6", "BG"],
    ["gemini", "gemini-2.5-pro", "US"],
    ["chat_gpt", "gpt-5", "XX"],
  ] as const)(
    "rejects unsupported %s country hints before a paid dispatch",
    async (modelSlug, modelName, country) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(okLlmResponse());
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        fetchLlmResponse({
          userPrompt: "Find local studios",
          modelSlug,
          modelName,
          webSearchCountryCode: country,
        }),
      ).rejects.toThrow(/Unsupported web-search country/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("runs Gemini with provider defaults when no country was requested", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okLlmResponse());
    vi.stubGlobal("fetch", fetchMock);
    await fetchLlmResponse({
      userPrompt: "Find local studios",
      modelSlug: "gemini",
      modelName: "gemini-2.5-pro",
    });
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      {
        user_prompt: "Find local studios",
        model_name: "gemini-2.5-pro",
        web_search: true,
        max_output_tokens: 1024,
      },
    ]);
  });
});
