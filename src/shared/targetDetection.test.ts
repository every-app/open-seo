import { describe, expect, it } from "vitest";
import { detectTarget } from "./targetDetection";

describe("detectTarget", () => {
  it.each([
    ["example.com", "example.com"],
    ["https://example.com", "example.com"],
    ["https://www.example.com/features", "example.com"],
    ["WWW.Example.COM", "example.com"],
    ["sub.example.com", "sub.example.com"],
  ])("treats %s as a domain", (input, expected) => {
    expect(detectTarget(input)).toEqual({ type: "domain", value: expected });
  });

  it.each([
    "Example Brand",
    "best ai video clipper",
    "OpenAI",
    "GPT-5",
    "ChatGPT pricing",
  ])("treats '%s' as a keyword", (input) => {
    expect(detectTarget(input)).toEqual({
      type: "keyword",
      value: input.trim(),
    });
  });

  it("falls back to keyword when input has spaces but contains a dot", () => {
    expect(detectTarget("Visit example.com today")).toEqual({
      type: "keyword",
      value: "Visit example.com today",
    });
  });

  it("falls back to keyword when domain normalization throws", () => {
    expect(detectTarget("not a real domain.")).toEqual({
      type: "keyword",
      value: "not a real domain.",
    });
  });

  it("trims whitespace before classification", () => {
    expect(detectTarget("  example.com  ")).toEqual({
      type: "domain",
      value: "example.com",
    });
  });
});
