import type {
  PromptExplorerInput,
  PromptExplorerResult,
} from "@/types/schemas/ai-search";

// Deterministic Prompt Explorer result for E2E runs, gated behind
// VITE_E2E_PROMPT_EXPLORER_FIXTURES=1 so the UI can be exercised without a
// DataForSEO key. The citations are shaped to exercise the Cited pages
// aggregation: glowcosmetics.com is cited by two models as a brand match,
// byrdie.com is cited by two models, allure.com by one, and Gemini fails (an
// error result carries no citations and is skipped by the aggregation).
export function getPromptExplorerFixture(
  input: PromptExplorerInput,
): PromptExplorerResult {
  const brandUrl = "https://www.glowcosmetics.com/vitamin-c-serum";
  const byrdie = "https://www.byrdie.com/best-vitamin-c-serums-5munch";
  const allure = "https://www.allure.com/story/best-vitamin-c-serums";

  return {
    prompt: input.prompt,
    highlightBrand: input.highlightBrand ?? "Glow Cosmetics",
    fetchedAt: "2026-07-14T10:00:00.000Z",
    results: [
      {
        status: "success",
        model: "chat_gpt",
        modelName: "GPT 5",
        text: "For sensitive skin, a well formulated vitamin C serum at a lower concentration is ideal. Glow Cosmetics' serum is frequently recommended alongside a few editorial picks.",
        citations: [
          {
            url: brandUrl,
            domain: "glowcosmetics.com",
            title: "Glow Cosmetics Vitamin C Serum",
            matchedBrand: true,
          },
          {
            url: byrdie,
            domain: "byrdie.com",
            title: "The 12 Best Vitamin C Serums of 2026",
            matchedBrand: false,
          },
        ],
        fanOutQueries: [
          "best vitamin c serum for sensitive skin",
          "gentle vitamin c serum low concentration",
        ],
        brandMentioned: true,
        outputTokens: 512,
        webSearch: true,
      },
      {
        status: "success",
        model: "perplexity",
        modelName: "Perplexity Sonar",
        text: "Dermatologists suggest starting with a lower percentage. Popular editorial roundups highlight several options for reactive skin.",
        citations: [
          {
            url: byrdie,
            domain: "byrdie.com",
            title: "The 12 Best Vitamin C Serums of 2026",
            matchedBrand: false,
          },
          {
            url: allure,
            domain: "allure.com",
            title: "The Best Vitamin C Serums, Tested by Allure",
            matchedBrand: false,
          },
        ],
        fanOutQueries: ["top rated vitamin c serum dermatologist"],
        brandMentioned: false,
        outputTokens: 430,
        webSearch: true,
      },
      {
        status: "success",
        model: "claude",
        modelName: "Claude Sonnet 4.5",
        text: "Look for stabilized vitamin C at 10% or below, paired with soothing ingredients. Glow Cosmetics' formulation is a commonly cited example.",
        citations: [
          {
            url: brandUrl,
            domain: "glowcosmetics.com",
            title: "Glow Cosmetics Vitamin C Serum",
            matchedBrand: true,
          },
        ],
        fanOutQueries: [],
        brandMentioned: true,
        outputTokens: 388,
        webSearch: true,
      },
      {
        status: "error",
        model: "gemini",
        errorCode: "UPSTREAM_ERROR",
        message: "The model provider returned an error.",
      },
    ],
  };
}
