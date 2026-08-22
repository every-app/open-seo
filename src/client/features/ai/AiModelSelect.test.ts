import { describe, expect, it } from "vitest";
import { filterModels } from "./modelFilter";
import type { AiModel } from "@/server/features/ai/providers";

const catalog: AiModel[] = [
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    provider: "openrouter",
    contextLength: 128000,
    promptPrice: 1.25,
    completionPrice: 10,
    supportsTools: true,
  },
  {
    id: "gpt-5",
    name: "GPT-5 (OpenAI)",
    provider: "openai",
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: true,
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: true,
  },
  {
    id: "some/embed-model",
    name: "Embedding Model",
    provider: "openrouter",
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: false,
  },
];

describe("filterModels", () => {
  it("returns all models sorted by name when the filter is empty", () => {
    const result = filterModels(catalog, "", null);
    expect(result.map((model) => model.id)).toEqual([
      "claude-sonnet-4-5",
      "some/embed-model",
      "gemini-2.5-flash",
      "openai/gpt-5",
      "gpt-5",
    ]);
  });

  it("filters by id fragment", () => {
    const result = filterModels(catalog, "gpt-5", null);
    expect(result.map((model) => model.id)).toEqual(["openai/gpt-5", "gpt-5"]);
  });

  it("filters by display name fragment", () => {
    const result = filterModels(catalog, "claude", null);
    expect(result.map((model) => model.id)).toEqual(["claude-sonnet-4-5"]);
  });

  it("is case-insensitive", () => {
    const result = filterModels(catalog, "GEMINI", null);
    expect(result.map((model) => model.id)).toEqual(["gemini-2.5-flash"]);
  });

  it("matches the provider display name", () => {
    const result = filterModels(catalog, "google", null);
    expect(result.map((model) => model.id)).toEqual(["gemini-2.5-flash"]);
    const anthropic = filterModels(catalog, "anthropic", null);
    expect(anthropic.map((model) => model.id)).toEqual(["claude-sonnet-4-5"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterModels(catalog, "zzz-no-such-model", null)).toEqual([]);
  });

  it("keeps the selected model even when it doesn't match the filter", () => {
    const result = filterModels(catalog, "claude", "gpt-5");
    expect(result.map((model) => model.id)).toEqual([
      "claude-sonnet-4-5",
      "gpt-5",
    ]);
  });

  it("clearing the filter restores the full list", () => {
    const narrowed = filterModels(catalog, "gpt", null);
    expect(narrowed).toHaveLength(2);
    expect(filterModels(catalog, "", null)).toHaveLength(catalog.length);
  });

  it("ignores a keep id that isn't in the catalog", () => {
    const result = filterModels(catalog, "gpt", "not-in-catalog");
    expect(result.map((model) => model.id)).toEqual(["openai/gpt-5", "gpt-5"]);
  });
});