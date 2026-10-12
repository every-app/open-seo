import { describe, expect, it, vi } from "vitest";
import { aiCostForAnswers } from "./aiVisibilityCost";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("../repositories/AiVisibilityRepository", () => ({
  AiVisibilityRepository: {},
}));
vi.mock("./aiVisibilityMutation", () => ({}));
const chatgpt = (count: number) => Array<"chatgpt">(count).fill("chatgpt");
// Real pricing functions and constants: only unused IO dependencies are mocked.
describe("AI collection estimates", () => {
  it("quotes hosted markup and credit rounding per provider call", () => {
    expect(aiCostForAnswers(chatgpt(12), true, "queued")).toEqual({
      providerCostUsd: 0.0144,
      costCredits: 24,
      costUsd: 0.024,
    });
    expect(aiCostForAnswers([], true, "queued")).toEqual({
      providerCostUsd: 0,
      costCredits: 0,
      costUsd: 0,
    });
  });
  it("quotes live answers for manual runs at the live price", () => {
    expect(aiCostForAnswers(chatgpt(3), false, "live").providerCostUsd).toBe(
      0.012,
    );
  });
  it("quotes self-hosted provider cost without markup or credits", () => {
    expect(aiCostForAnswers(chatgpt(3), false, "queued")).toEqual({
      providerCostUsd: 0.0036,
      costCredits: 0,
      costUsd: 0.0036,
    });
  });
  it("prices Claude and Perplexity at model API rates on every run", () => {
    for (const mode of ["queued", "live"] as const)
      expect(
        aiCostForAnswers(["claude", "perplexity"], false, mode).providerCostUsd,
      ).toBe(0.22);
  });
});
