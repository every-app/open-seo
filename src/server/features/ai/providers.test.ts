import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "ai";
import { APICallError } from "ai";
import { AiProviderRegistry } from "./providers";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  generateText: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (key: string) => {
    if (key === "OPENROUTER_API_KEY") return "sk-or-v1-test";
    return null;
  },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  CACHE_TTL: { aiModels: 43200 },
  getCached: async () => null,
  setCached: async () => {},
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => (modelId: string) => ({ modelId }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.generateText.mockReset();
});

const modelsPayload = {
  data: [
    {
      id: "minimax/minimax-m3",
      name: "MiniMax M3",
      context_length: 200000,
      pricing: { prompt: "0.1", completion: "0.4" },
      supported_parameters: ["tools"],
    },
    {
      id: "some/model",
      name: "Plain Model",
      context_length: null,
      pricing: null,
      supported_parameters: [],
    },
  ],
};

describe("openRouterProvider", () => {
  const provider = AiProviderRegistry.get("openrouter");

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.generateText.mockReset();
  });

  it("parses and caches the model catalog", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify(modelsPayload), { status: 200 }),
    );
    const models = await provider.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: "minimax/minimax-m3",
      supportsTools: true,
      contextLength: 200000,
      promptPrice: 0.1,
      completionPrice: 0.4,
    });
    expect(models[1].supportsTools).toBe(false);
    const [requestUrl, init] = mocks.fetch.mock.calls[0];
    expect(requestUrl).toBe("https://openrouter.ai/api/v1/models");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer sk-or-v1-test",
    });
  });

  it("throws when the catalog endpoint fails", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 502 }));
    await expect(provider.listModels()).rejects.toThrow(/status 502/);
  });

  it("reports ok when the model answers", async () => {
    mocks.generateText.mockResolvedValue({});
    await expect(provider.testConnection("minimax/minimax-m3")).resolves.toEqual({
      ok: true,
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: { modelId: "minimax/minimax-m3" } }),
    );
  });

  it("classifies an invalid API key", async () => {
    mocks.generateText.mockRejectedValue(
      new APICallError({
        message: "unauthorized",
        statusCode: 401,
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
      }),
    );
    const result = await provider.testConnection("minimax/minimax-m3");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_key");
  });

  it("classifies a missing model", async () => {
    mocks.generateText.mockRejectedValue(
      new APICallError({
        message: "not found",
        statusCode: 404,
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
      }),
    );
    const result = await provider.testConnection("nope/nope");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("model_unavailable");
  });

  it("classifies network/provider failures", async () => {
    mocks.generateText.mockRejectedValue(new Error("socket hang up"));
    const result = await provider.testConnection("minimax/minimax-m3");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("provider_unreachable");
  });
});

describe("AiProviderRegistry", () => {
  it("supports only openrouter and rejects unknown providers", () => {
    expect(AiProviderRegistry.list().map((p) => p.id)).toEqual(["openrouter"]);
    expect(() => AiProviderRegistry.get("anthropic")).toThrow(
      /Unsupported AI provider/,
    );
  });
});