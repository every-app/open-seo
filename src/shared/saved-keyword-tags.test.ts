import { describe, expect, it } from "vitest";
import {
  normalizeSavedKeywordTag,
  normalizeSavedKeywordTags,
  parseSavedKeywordTagInput,
} from "./saved-keyword-tags";

describe("saved keyword tag helpers", () => {
  it("normalizes display and lookup names", () => {
    expect(normalizeSavedKeywordTag("  Technical   SEO  ")).toEqual({
      name: "Technical SEO",
      normalizedName: "technical seo",
    });
  });

  it("dedupes tags by normalized name", () => {
    expect(
      normalizeSavedKeywordTags(["Content", "content", " technical seo "]),
    ).toEqual([
      { name: "Content", normalizedName: "content" },
      { name: "technical seo", normalizedName: "technical seo" },
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
