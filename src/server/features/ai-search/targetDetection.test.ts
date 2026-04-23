import { describe, expect, it } from "vitest";
import { detectTarget } from "./targetDetection";

describe("detectTarget", () => {
  it.each([
    ["opus.pro", "opus.pro"],
    ["https://opus.pro", "opus.pro"],
    ["https://www.opus.pro/features", "opus.pro"],
    ["WWW.Example.COM", "example.com"],
    ["sub.example.io", "sub.example.io"],
  ])("treats %s as a domain", (input, expected) => {
    expect(detectTarget(input)).toEqual({ type: "domain", value: expected });
  });

  it.each([
    "Opus Clip",
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
    expect(detectTarget("  opus.pro  ")).toEqual({
      type: "domain",
      value: "opus.pro",
    });
  });
});
