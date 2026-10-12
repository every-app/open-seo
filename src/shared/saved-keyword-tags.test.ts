import { describe, expect, it } from "vitest";
import {
  normalizeSavedKeywordTags,
  parseSavedKeywordTagInput,
} from "./saved-keyword-tags";

describe("saved keyword tag helpers", () => {
  it("dedupes tags by normalized name", () => {
    expect(
      normalizeSavedKeywordTags([
        "Content",
        "content",
        "  Technical   SEO  ",
        "technical seo",
      ]),
    ).toEqual([
      { name: "Content", normalizedName: "content" },
      { name: "Technical SEO", normalizedName: "technical seo" },
    ]);
  });

  it("parses comma and newline separated tag input", () => {
    expect(parseSavedKeywordTagInput("content, technical seo\nBOFU")).toEqual([
      "content",
      "technical seo",
      "BOFU",
    ]);
  });
});
