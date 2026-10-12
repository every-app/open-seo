import { identity, sortBy } from "remeda";
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
  it("uses top_pages metrics and attaches deduped prompt examples", () => {
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
            // The same page cited twice in one answer is one example.
            citedMention("cheap seo", 500, [
              "https://a.com/x",
              "https://a.com/x",
            ]),
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
    expect(
      sortBy(
        sources[0].keywords.map((k) => k.question),
        identity(),
      ),
    ).toEqual(["best seo tools", "cheap seo"]);
  });
});
