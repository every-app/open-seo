import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "ai";
import { APICallError } from "ai";
import { AiProviderRegistry, SUPPORTED_PROVIDERS } from "./providers";

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
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => (modelId: string) => ({ modelId }),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (modelId: string) => ({ modelId }),
}));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (modelId: string) => ({ modelId }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.generateText.mockReset();
  vi.restoreAllMocks();
});

const openRouterModelsPayload = {
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

  it("parses and caches the model catalog", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify(openRouterModelsPayload), { status: 200 }),
    );
    const models = await provider.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: "minimax/minimax-m3",
      provider: "openrouter",
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
    const result = await provider.testConnection("minimax/minimax-m3");
    expect(result.ok).toBe(true);
    expect(result.toolCallingVerified).toBe(false);
    expect(result.latencyMs).toEqual(expect.any(Number));
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
    expect(result.error).toBe("AUTH_ERROR");
    expect(result.toolCallingVerified).toBe(false);
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
    expect(result.error).toBe("MODEL_UNAVAILABLE");
  });

  it("classifies network/provider failures", async () => {
    mocks.generateText.mockRejectedValue(new Error("socket hang up"));
    const result = await provider.testConnection("minimax/minimax-m3");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("PROVIDER_UNAVAILABLE");
  });

  it("extracts the real USD cost from provider metadata", () => {
    expect(
      provider.estimateCostUsd({
        openrouter: { usage: { cost: 0.0123 } },
      }),
    ).toBe(0.0123);
    expect(provider.estimateCostUsd({ openrouter: {} })).toBe(0);
    expect(provider.estimateCostUsd(null)).toBe(0);
  });
});

describe("openAiProvider", () => {
  const provider = AiProviderRegistry.get("openai");

  it("returns an empty catalog when unconfigured", async () => {
    expect(await provider.listModels()).toEqual([]);
  });

  it("parses the models catalog when configured", async () => {
    vi.spyOn(provider, "getApiKey").mockResolvedValue("sk-test");
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-5" }, { id: "whisper-1" }] }), {
        status: 200,
      }),
    );
    const models = await provider.listModels();
    expect(models).toMatchObject([
      { id: "gpt-5", provider: "openai", supportsTools: true, promptPrice: null },
      { id: "whisper-1", provider: "openai", supportsTools: false },
    ]);
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  });

  it("reports ok when the model answers", async () => {
    vi.spyOn(provider, "getApiKey").mockResolvedValue("sk-test");
    mocks.generateText.mockResolvedValue({});
    const result = await provider.testConnection("gpt-5");
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-5");
  });

  it("reports a missing key without calling the API", async () => {
    const result = await provider.testConnection("gpt-5");
    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_ERROR",
      provider: "openai",
      model: "gpt-5",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("never invents pricing", () => {
    expect(provider.estimateCostUsd({ usage: { inputTokens: 1 } })).toBe(0);
  });
});

describe("geminiProvider", () => {
  const provider = AiProviderRegistry.get("gemini");

  it("parses the catalog and strips the models/ prefix", async () => {
    vi.spyOn(provider, "getApiKey").mockResolvedValue("ai-test");
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              supportedGenerationMethods: ["generateContent", "embedContent"],
            },
            {
              name: "models/text-embedding-004",
              displayName: "Embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const models = await provider.listModels();
    expect(models).toEqual([
      expect.objectContaining({
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "gemini",
      }),
    ]);
    expect(models[0].supportsTools).toBe(true);
  });

  it("reports ok when the model answers", async () => {
    vi.spyOn(provider, "getApiKey").mockResolvedValue("ai-test");
    mocks.generateText.mockResolvedValue({});
    const result = await provider.testConnection("gemini-2.5-flash");
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("gemini");
  });

  it("reports a missing key without calling the API", async () => {
    const result = await provider.testConnection("gemini-2.5-flash");
    expect(result).toMatchObject({ ok: false, error: "AUTH_ERROR", provider: "gemini" });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});

describe("anthropicProvider", () => {
  const provider = AiProviderRegistry.get("anthropic");

  it("parses the catalog", async () => {
    vi.spyOn(provider, "getApiKey").mockResolvedValue("sk-ant-test");
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
            { id: "claude-3-5-haiku", display_name: null },
          ],
        }),
        { status: 200 },
      ),
    );
    const models = await provider.listModels();
    expect(models).toEqual([
      expect.objectContaining({
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        provider: "anthropic",
        supportsTools: true,
      }),
      expect.objectContaining({ id: "claude-3-5-haiku", name: "claude-3-5-haiku" }),
    ]);
    const [requestUrl, init] = mocks.fetch.mock.calls[0];
    expect(requestUrl).toBe("https://api.anthropic.com/v1/models");
    expect(init?.headers).toMatchObject({
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
    });
  });

  it("reports ok when the model answers", async () => {
    vi.spyOn(provider, "getApiKey").mockResolvedValue("sk-ant-test");
    mocks.generateText.mockResolvedValue({});
    const result = await provider.testConnection("claude-sonnet-4-5");
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("anthropic");
  });

  it("reports a missing key without calling the API", async () => {
    const result = await provider.testConnection("claude-sonnet-4-5");
    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_ERROR",
      provider: "anthropic",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});

describe("AiProviderRegistry", () => {
  it("lists every supported provider", () => {
    expect(AiProviderRegistry.list().map((p) => p.id)).toEqual(
      SUPPORTED_PROVIDERS,
    );
  });

  it("rejects unknown providers", () => {
    expect(() => AiProviderRegistry.get("anthropicx")).toThrow(
      /Unsupported AI provider/,
    );
  });

  it("resolves the env default provider", () => {
    expect(AiProviderRegistry.getEnvDefaultProviderId()).toBe("openrouter");
    expect(AiProviderRegistry.getEnvDefaultProviderId("")).toBe("openrouter");
    expect(AiProviderRegistry.getEnvDefaultProviderId("not-a-provider")).toBe(
      "openrouter",
    );
    expect(AiProviderRegistry.getEnvDefaultProviderId("gemini")).toBe("gemini");
    expect(AiProviderRegistry.getEnvDefaultProviderId("anthropic")).toBe(
      "anthropic",
    );
  });

  it("probes on a reliable default model (free pools are rate-limit saturated)", () => {
    const openrouter = AiProviderRegistry.get("openrouter");
    expect(openrouter.connectionTestModelId).toBe(
      openrouter.defaultModelId,
    );
    for (const provider of AiProviderRegistry.list()) {
      expect(provider.connectionTestModelId).toBeTruthy();
    }
  });
});