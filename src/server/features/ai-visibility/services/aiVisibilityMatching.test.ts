import { describe, expect, it } from "vitest";
import type { ParsedAiAnswer } from "../providers/dataforseoEvidence";
import {
  aiMentionSpans,
  aiPromptIsBranded,
  matchAiBrand,
  ownedAiDomain,
} from "./aiVisibilityMatching";

const brand = { name: "OpenSEO", domain: "openseo.so" };
function answer(text: string, citedHosts: string[] = []): ParsedAiAnswer {
  return {
    answerMarkdown: text,
    answerText: text,
    citations: citedHosts.map((domain, index) => ({
      url: `https://${domain}/guide`,
      domain,
      title: null,
      position: index + 1,
    })),
    collectedAt: null,
  };
}

describe("brand mentions", () => {
  it.each([
    ["OpenSEO is an open-source toolkit.", 0],
    ["OpenSEO's MCP supports research.", 0],
    ["Try openseo.so for audits.", 4],
    ["OpenSEOsomething and MyOpenSEO are different names.", null],
    ["Links: https://openseo.so/OpenSEO and www.openseo.so/OpenSEO", null],
    ["Email OpenSEO@example.com or help@openseo.so.", null],
    ["An unrelated toolkit has similar features.", null],
  ])("%s", (text, firstMention) => {
    expect(matchAiBrand(answer(text), brand)).toMatchObject({
      mentioned: firstMention !== null,
      firstMention,
    });
  });

  it("returns original UTF-16 offsets through emoji and both Unicode accent forms", () => {
    const text = "🔎 Café and Café are the same spelling.";
    const spans = aiMentionSpans(text, ["Café"]);
    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual([
      "Café",
      "Café",
    ]);
    expect(spans[0]).toEqual({ start: 3, end: 7 });
  });

  it("escapes regex syntax and keeps the longest overlapping name", () => {
    const text = "C++ Tools and Open SEO Tools";
    expect(
      aiMentionSpans(text, ["C++ Tools", "Open SEO", "Open SEO Tools"]).map(
        (s) => text.slice(s.start, s.end),
      ),
    ).toEqual(["C++ Tools", "Open SEO Tools"]);
  });
});

describe("brand citations", () => {
  it.each(["openseo.so", "www.openseo.so", "docs.openseo.so"])(
    "counts a cited page on %s",
    (host) => {
      expect(matchAiBrand(answer("Other tools.", [host]), brand)).toMatchObject(
        { mentioned: false, cited: true },
      );
    },
  );
  it.each(["openseo.so.evil.example", "notopenseo.so", "openseo.com"])(
    "does not count %s",
    (host) => {
      expect(ownedAiDomain(host, brand.domain)).toBe(false);
      expect(matchAiBrand(answer("Other tools.", [host]), brand).cited).toBe(
        false,
      );
    },
  );
});

describe("branded prompt cohort", () => {
  it.each([
    "What is OpenSEO?",
    "Review https://openseo.so",
    "What does www.openseo.so offer?",
    "Review docs.openseo.so/mcp",
  ])("includes %s", (prompt) => {
    expect(aiPromptIsBranded(prompt, brand)).toBe(true);
  });
  it.each([
    "Best open source SEO tools?",
    "Review https://openseo.so.evil.example",
    "Review https://notopenseo.so",
  ])("excludes %s", (prompt) => {
    expect(aiPromptIsBranded(prompt, brand)).toBe(false);
  });
});
