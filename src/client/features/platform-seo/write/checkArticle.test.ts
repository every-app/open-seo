import { describe, expect, it } from "vitest";
import { checkArticle } from "./checkArticle";

const body = `Parasite SEO means publishing on a site Google already trusts.

## How does it work?

You post on [Medium](https://medium.com) and the article ranks.

## Is Parasite-SEO legal?

Yes. The parasite seo tactic is allowed.

## Best site for parasite SEO

Parasite SEO sites differ.`;

const result = checkArticle({
  title: "What is parasite SEO?",
  body,
  primaryKeyword: "parasite seo",
  keywords: ["parasite seo", "parasite seo medium", "medium"],
  questions: [
    "is parasite seo legal",
    "how does parasite seo work",
    "which sites are best",
  ],
  outline: ["How it works", "Pricing and costs", "Best sites to use"],
});

describe("checkArticle", () => {
  it("matches the target keyword through case, hyphens and Markdown", () => {
    expect(result.keywordChecks.map((c) => c.done)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    // The heading and the paragraph right after it both count.
    expect(result.keywordChecks[3].detail).toBe("5 times");
  });

  it("counts a question as answered only when one section covers all of it", () => {
    // "parasite seo" and "how does it work" are in different sections.
    // "sites" in the question matches "site" in the heading.
    expect(result.questionChecks.map((c) => c.done)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("matches outline headings loosely and keywords as whole phrases", () => {
    expect(result.outlineChecks.map((c) => c.done)).toEqual([
      true,
      false,
      true,
    ]);
    // Link text counts; "parasite seo medium" never appears as a phrase.
    expect(result.supportingChecks).toEqual([
      { label: "parasite seo medium", done: false },
      { label: "medium", done: true },
    ]);
  });
});
