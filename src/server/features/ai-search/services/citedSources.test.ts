import { describe, expect, it } from "vitest";
import { deriveCitedSources } from "./citedSources";
import type {
  LlmMentionItem,
  LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";

function citedMention(
  question: string,
  aiSearchVolume: number | null,
  urls: string[],
): LlmMentionItem {
  return {
    question,
    ai_search_volume: aiSearchVolume,
    sources: urls.map((url) => ({ url })),
  };
}

function topPage(
  url: string,
  platform: "chat_gpt" | "google",
  mentions: number | null,
  aiSearchVolume: number | null,
): LlmTopPagesItem {
  return {
    key: url,
    platform: [{ key: platform, mentions, ai_search_volume: aiSearchVolume }],
  };
}

describe("deriveCitedSources", () => {
  it("uses top_pages metrics and attaches matching prompt examples", () => {
    const sources = deriveCitedSources(
      [
        {
          platform: "google",
          topPages: [
            topPage("https://a.com/x", "google", 9, 9000),
            topPage("https://b.com/y", "google", 2, 1000),
          ],
          mentions: [
            citedMention("best seo tools", 1000, [
              "https://a.com/x",
              "https://b.com/y",
            ]),
            citedMention("cheap seo", 500, ["https://a.com/x"]),
          ],
        },
      ],
      { sourcesPerPlatform: 20, keywordsPerSource: 50 },
    );

    expect(sources[0]).toMatchObject({
      domain: "a.com",
      mentions: 9,
      capturedVolume: 9000,
    });
    expect(sources[0].keywords.map((k) => k.question).toSorted()).toEqual([
      "best seo tools",
      "cheap seo",
    ]);
  });

  it("dedupes sampled prompt examples and derives domains from urls", () => {
    const sources = deriveCitedSources(
      [
        {
          platform: "google",
          topPages: [topPage("https://evil.example/path", "google", 3, 300)],
          mentions: [
            {
              question: "q",
              ai_search_volume: 200,
              sources: [
                {
                  url: "https://evil.example/path",
                  domain: "customer.example",
                },
                { url: "https://evil.example/path" },
              ],
            },
          ],
        },
      ],
      { sourcesPerPlatform: 20, keywordsPerSource: 50 },
    );

    expect(sources[0]).toMatchObject({
      url: "https://evil.example/path",
      domain: "evil.example",
    });
    expect(sources[0].keywords).toEqual([
      { question: "q", aiSearchVolume: 200 },
    ]);
  });
});
