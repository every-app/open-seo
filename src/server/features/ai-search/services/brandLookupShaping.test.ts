import { describe, expect, it } from "vitest";
import { shapeResult, type ShapeArgs } from "./brandLookupShaping";
import type {
  LlmCrossAggregatedItem,
  LlmMentionItem,
  LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import { brandLookupResultSchema } from "@/types/schemas/ai-search";

function platformBundle(
  platform: "chat_gpt" | "google",
  mentions: number | null,
  aiSearchVolume: number | null,
): ShapeArgs["platformBundles"][number] {
  return {
    platform,
    status: "success",
    bundle: {
      aggregated: {
        platform: [
          { key: platform, mentions, ai_search_volume: aiSearchVolume },
        ],
      },
      topPages: [],
      mentions: [],
      complete: true,
    },
  };
}

function crossItem(
  key: string,
  platformMentions: Array<{ key: string; mentions: number | null }>,
): LlmCrossAggregatedItem {
  return {
    key,
    platform: platformMentions.map((p) => ({
      key: p.key,
      mentions: p.mentions,
      ai_search_volume: null,
    })),
  };
}

function baseArgs(overrides: Partial<ShapeArgs> = {}): ShapeArgs {
  return {
    query: "acme",
    detected: { type: "keyword", value: "acme" },
    platformBundles: [
      platformBundle("chat_gpt", 10, 100),
      platformBundle("google", 5, 50),
    ],
    crossOutcomes: [],
    competitorKeys: [],
    userLocationCode: 2840,
    userLanguageCode: "en",
    ...overrides,
  };
}

describe("shapeResult", () => {
  it("excludes ChatGPT from totals and SoV outside US/en", () => {
    const result = shapeResult(
      baseArgs({
        userLocationCode: 2826,
        competitorKeys: ["rival"],
        crossOutcomes: [
          {
            platform: "chat_gpt",
            status: "success",
            items: [
              crossItem("acme", [{ key: "chat_gpt", mentions: 90 }]),
              crossItem("rival", [{ key: "chat_gpt", mentions: 10 }]),
            ],
          },
          {
            platform: "google",
            status: "success",
            items: [
              crossItem("acme", [{ key: "google", mentions: 10 }]),
              crossItem("rival", [{ key: "google", mentions: 30 }]),
            ],
          },
        ],
      }),
    );

    expect(result.totalMentions).toBe(5);
    expect(result.shareOfVoice?.platforms).toEqual(["google"]);
    expect(result.shareOfVoice?.entries[0]).toMatchObject({
      label: "rival",
      sharePct: 75,
    });
  });

  it("derives top-query cited source domains from urls and caps long output", () => {
    const longTitle = "x".repeat(400);
    const result = shapeResult(
      baseArgs({
        platformBundles: [
          {
            platform: "google",
            status: "success",
            bundle: {
              aggregated: { platform: [] },
              topPages: [],
              mentions: [
                {
                  question: "q".repeat(600),
                  ai_search_volume: 100,
                  sources: [
                    {
                      url: "https://evil.example/path",
                      domain: "customer.example",
                      title: longTitle,
                    },
                  ],
                  brand_entities: [{ title: "b".repeat(300) }],
                } satisfies LlmMentionItem,
              ],
              complete: true,
            },
          },
        ],
      }),
    );

    expect(result.topQueries[0].question).toHaveLength(500);
    expect(result.topQueries[0].citedSources[0]).toMatchObject({
      url: "https://evil.example/path",
      domain: "evil.example",
      title: "x".repeat(300),
    });
    expect(result.topQueries[0].brandsMentioned[0]).toHaveLength(200);
  });

  it("round-trips through the cache schema", () => {
    const topPage: LlmTopPagesItem = {
      key: "https://a.com",
      platform: [{ key: "google", mentions: 3, ai_search_volume: 300 }],
    };
    const result = shapeResult(
      baseArgs({
        platformBundles: [
          {
            platform: "google",
            status: "success",
            bundle: {
              aggregated: { platform: [] },
              topPages: [topPage],
              mentions: [],
              complete: true,
            },
          },
        ],
      }),
    );

    expect(result.topPages[0]).toMatchObject({
      domain: "a.com",
      mentions: 3,
      capturedVolume: 300,
    });
    expect(brandLookupResultSchema.safeParse(result).success).toBe(true);
  });
});
