import { describe, expect, it } from "vitest";
import type {
  PromptExplorerCitation,
  PromptExplorerModel,
  PromptExplorerModelResult,
} from "@/types/schemas/ai-search";
import { aggregateCitedPages } from "./promptExplorerCitedPages";

function makeCitation(
  overrides: Partial<PromptExplorerCitation> = {},
): PromptExplorerCitation {
  return {
    url: "https://example.com/a",
    domain: "example.com",
    title: "Example",
    matchedBrand: false,
    ...overrides,
  };
}

function makeSuccess(
  model: PromptExplorerModel,
  citations: PromptExplorerCitation[],
): PromptExplorerModelResult {
  return {
    status: "success",
    model,
    modelName: `${model}-latest`,
    text: "answer",
    citations,
    fanOutQueries: [],
    brandMentioned: null,
    outputTokens: 10,
    webSearch: true,
  };
}

function makeError(model: PromptExplorerModel): PromptExplorerModelResult {
  return {
    status: "error",
    model,
    errorCode: "UPSTREAM_ERROR",
    message: "upstream failed",
  };
}

describe("aggregateCitedPages", () => {
  it("returns an empty list when there are no citations", () => {
    expect(aggregateCitedPages([])).toEqual([]);
    expect(aggregateCitedPages([makeSuccess("claude", [])])).toEqual([]);
  });

  it("deduplicates the same URL cited by multiple models", () => {
    const url = "https://example.com/shared";
    const pages = aggregateCitedPages([
      makeSuccess("chat_gpt", [makeCitation({ url })]),
      makeSuccess("claude", [makeCitation({ url })]),
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0].url).toBe(url);
    expect(pages[0].citationCount).toBe(2);
  });

  it("attributes each page to the distinct models that cited it", () => {
    const shared = "https://example.com/shared";
    const soloUrl = "https://example.com/solo";
    const pages = aggregateCitedPages([
      makeSuccess("chat_gpt", [
        makeCitation({ url: shared }),
        // A model citing the same URL twice must not double-count.
        makeCitation({ url: shared }),
      ]),
      makeSuccess("claude", [makeCitation({ url: shared })]),
      makeSuccess("gemini", [makeCitation({ url: soloUrl })]),
    ]);

    const sharedPage = pages.find((page) => page.url === shared);
    const soloPage = pages.find((page) => page.url === soloUrl);

    expect(sharedPage?.models).toEqual(["chat_gpt", "claude"]);
    expect(sharedPage?.citationCount).toBe(2);
    expect(soloPage?.models).toEqual(["gemini"]);
    expect(soloPage?.citationCount).toBe(1);
  });

  it("preserves a brand match reported by any model (logical OR)", () => {
    const url = "https://brand.com/page";
    const pages = aggregateCitedPages([
      makeSuccess("chat_gpt", [makeCitation({ url, matchedBrand: false })]),
      makeSuccess("claude", [makeCitation({ url, matchedBrand: true })]),
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0].matchedBrand).toBe(true);
  });

  it("keeps matchedBrand false when no model reports a match", () => {
    const pages = aggregateCitedPages([
      makeSuccess("chat_gpt", [makeCitation({ matchedBrand: false })]),
    ]);

    expect(pages[0].matchedBrand).toBe(false);
  });

  it("fills title and domain from the first non-null citation", () => {
    const url = "https://example.com/page";
    const pages = aggregateCitedPages([
      makeSuccess("chat_gpt", [
        makeCitation({ url, title: null, domain: null }),
      ]),
      makeSuccess("claude", [
        makeCitation({ url, title: "Real title", domain: "example.com" }),
      ]),
    ]);

    expect(pages[0].title).toBe("Real title");
    expect(pages[0].domain).toBe("example.com");
  });

  it("ignores error results", () => {
    const pages = aggregateCitedPages([
      makeError("perplexity"),
      makeSuccess("claude", [makeCitation({ url: "https://example.com/ok" })]),
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0].models).toEqual(["claude"]);
  });

  it("orders rows by citation count, then brand match, then URL", () => {
    const twice = "https://example.com/twice";
    const brandOnce = "https://brand.com/once";
    const plainOnce = "https://example.com/once";
    const pages = aggregateCitedPages([
      makeSuccess("chat_gpt", [
        makeCitation({ url: twice }),
        makeCitation({ url: brandOnce, matchedBrand: true }),
        makeCitation({ url: plainOnce }),
      ]),
      makeSuccess("claude", [makeCitation({ url: twice })]),
    ]);

    expect(pages.map((page) => page.url)).toEqual([
      twice, // count 2 wins
      brandOnce, // count 1, brand match ahead of plain
      plainOnce, // count 1, no brand match
    ]);
  });
});
