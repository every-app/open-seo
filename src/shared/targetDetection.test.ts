import { describe, expect, it } from "vitest";
import { detectTarget } from "./targetDetection";

describe("detectTarget", () => {
  it.each([
    ["  example.com  ", "example.com"],
    ["https://example.com", "example.com"],
    ["sub.example.com", "sub.example.com"],
  ])("treats %s as a domain", (input, expected) => {
    expect(detectTarget(input)).toEqual({ type: "domain", value: expected });
  });

  it.each(["GPT-5", "best ai video clipper"])(
    "treats '%s' as a keyword",
    (input) => {
      expect(detectTarget(input)).toEqual({ type: "keyword", value: input });
    },
  );

  it("falls back to keyword when input has spaces but contains a dot", () => {
    expect(detectTarget("Visit example.com today")).toEqual({
      type: "keyword",
      value: "Visit example.com today",
    });
  });
});
