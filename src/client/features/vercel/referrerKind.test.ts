import { describe, expect, it } from "vitest";
import { isAiReferrer, isSearchReferrer, referrerLabel } from "./referrerKind";

describe("referrerKind", () => {
  it("classifies search engines", () => {
    expect(isSearchReferrer("google.com")).toBe(true);
    expect(isSearchReferrer("www.bing.com")).toBe(true);
    expect(isSearchReferrer("duckduckgo.com")).toBe(true);
    expect(isSearchReferrer("github.com")).toBe(false);
  });

  it("classifies AI assistants", () => {
    expect(isAiReferrer("claude.ai")).toBe(true);
    expect(isAiReferrer("chatgpt.com")).toBe(true);
    expect(isAiReferrer("gemini.google.com")).toBe(true);
    expect(isAiReferrer("google.com")).toBe(false);
  });

  it("never badges Vercel's synthetic rows", () => {
    for (const synthetic of ["", "Others"]) {
      expect(isSearchReferrer(synthetic)).toBe(false);
      expect(isAiReferrer(synthetic)).toBe(false);
    }
  });

  it("labels direct traffic and passes hostnames through", () => {
    expect(referrerLabel("")).toBe("Direct / none");
    expect(referrerLabel("claude.ai")).toBe("claude.ai");
  });
});
