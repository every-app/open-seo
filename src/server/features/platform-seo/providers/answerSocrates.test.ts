import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAnswerSocratesKeywords } from "./answerSocrates";

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "as_live_test",
}));

// Trimmed from a real GET /api/v1/keywords response.
const body = {
  query: "parasite seo",
  total_keywords: 6,
  groups: {
    questions: { count: 1, keywords: ["is parasite seo legal"] },
    "in the past": { count: 1, keywords: ["does parasite seo still work"] },
    comparisons: { count: 1, keywords: ["parasite seo vs  guest posting"] },
    prepositions: { count: 1, keywords: ["parasite seo case study"] },
  },
  autocomplete: {
    count: 2,
    keywords: ["Parasite SEO agency", "is parasite seo legal"],
  },
  warnings: [],
};

describe("fetchAnswerSocratesKeywords", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body)),
    );
  });

  it("reads every named group and autocomplete, keeping a keyword's named group", async () => {
    const keywords = await fetchAnswerSocratesKeywords({
      seed: "parasite seo",
      country: "US",
      language: "en",
    });

    expect(keywords).toEqual([
      { keyword: "is parasite seo legal", group: "question" },
      { keyword: "does parasite seo still work", group: "time" },
      { keyword: "parasite seo vs guest posting", group: "comparison" },
      { keyword: "parasite seo case study", group: "preposition" },
      { keyword: "parasite seo agency", group: "autocomplete" },
    ]);
  });
});
