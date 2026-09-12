import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "ai";
import {
  AiProviderRegistry,
  validateModelForProvider,
} from "./providers";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  generateText: vi.fn(),
  env: {} as Record<string, string | undefined>,
  hosted: false,
  cache: new Map<string, unknown>(),
  create: vi.fn<(config: unknown) => {
    chatModel: (modelId: string) => { modelId: string };
  }>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (key: string) => mocks.env[key],
  isHostedServerAuthMode: () => Promise.resolve(mocks.hosted),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  CACHE_TTL: { aiModels: 43200 },
  // Real in-memory caching so catalog identity/refresh behavior is provable.
  getCached: async (key: string) => mocks.cache.get(key),
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: (config: unknown) => mocks.create(config),
}));

// Capture what the compatible-SDK factory receives so tests can assert the
// normalized Base URL and key handling without network I/O.
const compatibleFactory = { create: mocks.create };

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.generateText.mockReset();
  mocks.cache.clear();
  compatibleFactory.create.mockReset();
  compatibleFactory.create.mockImplementation(() => ({
    chatModel: (modelId: string) => ({ modelId }),
  }));
  mocks.env = {};
  mocks.hosted = false;
});

describe("ollamaCloudProvider", () => {
  const provider = AiProviderRegistry.get("ollama_cloud");

  it("defaults to the official Ollama Cloud endpoint", async () => {
    mocks.env.OLLAMA_API_KEY = "ollama-key";
    await provider.prepare?.();
    provider.buildModel("ollama-key", "qwen3-coder:480b-cloud");
    expect(compatibleFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://ollama.com/v1",
        apiKey: "ollama-key",
      }),
    );
  });

  it("honors a custom Base URL and normalizes trailing slashes", async () => {
    mocks.env.OLLAMA_API_KEY = "k";
    mocks.env.OLLAMA_CLOUD_BASE_URL = "https://ollama.example.com/v1/";
    await provider.prepare?.();
    provider.buildModel("k", "m");
    expect(compatibleFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://ollama.example.com/v1" }),
    );
  });

  it("reports a missing key as AUTH_ERROR without calling the API", async () => {
    const result = await provider.testConnection("some-model");
    expect(result).toMatchObject({ ok: false, error: "AUTH_ERROR" });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("discovers models from the OpenAI-compatible /models route", async () => {
    mocks.env.OLLAMA_API_KEY = "k";
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-oss:120b-cloud" }] }), {
        status: 200,
      }),
    );
    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "gpt-oss:120b-cloud",
      provider: "ollama_cloud",
      // Nothing invented for values the endpoint did not expose:
      contextLength: null,
      promptPrice: null,
      // Unknown capability must read as tool-capable so toolCallingRefusalFor
      // never blocks a real tool-using model on a placeholder.
      supportsTools: true,
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://ollama.com/v1/models",
      expect.anything(),
    );
  });

  it("falls back to manual model entry when discovery fails", async () => {
    mocks.env.OLLAMA_API_KEY = "k";
    mocks.fetch.mockRejectedValue(new Error("boom"));
    expect(await provider.listModels()).toEqual([]);
  });

  it("caches catalogs PER normalized Base URL - gateways never share (S17/S26)", async () => {
    mocks.env.OLLAMA_API_KEY = "k";
    mocks.env.OLLAMA_CLOUD_BASE_URL = "https://gateway-a.example.com/v1/";
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-a" }] }), { status: 200 }),
    );
    const a1 = await provider.listModels();
    expect(a1.map((m) => m.id)).toEqual(["model-a"]);

    // Different Base URL - different cache identity - fresh fetch.
    mocks.env.OLLAMA_CLOUD_BASE_URL = "https://gateway-b.example.com/v1";
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-x" }] }), { status: 200 }),
    );
    const b1 = await provider.listModels();
    expect(b1.map((m) => m.id)).toEqual(["model-x"]);

    // Back to Gateway A: served from ITS cache (second fetch for A happened
    // once - the two gateway caches are independent).
    mocks.env.OLLAMA_CLOUD_BASE_URL = "https://gateway-a.example.com/v1";
    const a2 = await provider.listModels();
    expect(a2.map((m) => m.id)).toEqual(["model-a"]);
    const catalogUrls = mocks.fetch.mock.calls.map(
      // oxlint-disable-next-line typescript/no-base-to-string -- fetch mock calls carry string URLs in these tests
      (call) => String(call[0]),
    );
    expect(catalogUrls).toContain("https://gateway-a.example.com/v1/models");
    expect(catalogUrls).toContain("https://gateway-b.example.com/v1/models");
  });

  it("explicit Base URL + key overrides drive discovery (unsaved edits, S14)", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "override-model" }] }), {
        status: 200,
      }),
    );
    const models = await provider.listModels({
      baseUrl: "https://unsaved.example.com/v1/",
      apiKey: "unsaved-key",
    });
    expect(models.map((m) => m.id)).toEqual(["override-model"]);
    const [url, init] = mocks.fetch.mock.calls[0];
    // oxlint-disable-next-line typescript/no-base-to-string -- fetch mock calls carry string URLs in these tests
    expect(String(url)).toBe("https://unsaved.example.com/v1/models");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RequestInit shape is test-controlled
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer unsaved-key",
    );
  });

  it("refresh bypasses the cache and picks up new models (S16/S31)", async () => {
    mocks.env.OLLAMA_API_KEY = "k";
    // First (cached) load: only model-a.
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-a" }] }), { status: 200 }),
    );
    expect((await provider.listModels()).map((m) => m.id)).toEqual(["model-a"]);
    // Provider gains a model; the CACHED read still returns the old catalog-
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "model-a" }, { id: "model-new" }] }),
        { status: 200 },
      ),
    );
    expect((await provider.listModels()).map((m) => m.id)).toEqual(["model-a"]);
    // -but refresh bypasses the cache and returns the fresh catalog.
    const refreshed = await provider.listModels({ refresh: true });
    expect(refreshed.map((m) => m.id)).toEqual(["model-a", "model-new"]);
    // And the refreshed catalog is now what the cache serves.
    expect((await provider.listModels()).map((m) => m.id)).toEqual([
      "model-a",
      "model-new",
    ]);
  });
});

describe("openAiCompatibleProvider", () => {
  const provider = AiProviderRegistry.get("openai_compatible");

  it("is usable without an API key (key-less local gateways)", async () => {
    mocks.env.OPENAI_COMPATIBLE_BASE_URL = "http://localhost:11434/v1";
    // Self-hosted posture allows the loopback target.
    expect(await provider.isConfigured()).toBe(true);
    const result = await provider.testConnection("qwen3.5");
    expect(result.ok).toBe(true);
    expect(compatibleFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://localhost:11434/v1" }),
    );
  });

  it("rejects private targets with INVALID_BASE_URL in hosted mode", async () => {
    mocks.hosted = true;
    mocks.env.OPENAI_COMPATIBLE_BASE_URL = "http://localhost:11434/v1";
    const result = await provider.testConnection("m");
    expect(result).toMatchObject({ ok: false, error: "INVALID_BASE_URL" });
  });

  it("rejects cloud metadata endpoints even when self-hosted", async () => {
    mocks.env.OPENAI_COMPATIBLE_BASE_URL =
      "http://169.254.169.254/latest/v1";
    const result = await provider.testConnection("m");
    expect(result).toMatchObject({ ok: false, error: "INVALID_BASE_URL" });
  });

  it("reports a missing Base URL as not configured", async () => {
    expect(await provider.isConfigured()).toBe(false);
    const result = await provider.testConnection("m");
    expect(result).toMatchObject({ ok: false, error: "INVALID_BASE_URL" });
  });

  it("verifies the configured model and tool calling on connection test", async () => {
    mocks.env.OPENAI_COMPATIBLE_API_KEY = "sk-gateway";
    mocks.env.OPENAI_COMPATIBLE_BASE_URL = "https://gw.example.com/api/v1";
    // First probeGeneration resolves; the tool probe sees one tool call.
    mocks.generateText
      .mockResolvedValueOnce({ text: "ok" })
      .mockResolvedValueOnce({ toolCalls: [{ toolName: "ping" }] });
    const result = await provider.testConnection("mymodel");
    expect(result.ok).toBe(true);
    expect(result.toolCallingVerified).toBe(true);
    expect(result.latencyMs).not.toBe(null);
  });

  it("classifies connection failures to unreachable gateways as INVALID_BASE_URL", async () => {
    mocks.env.OPENAI_COMPATIBLE_BASE_URL = "https://gone.example.com/v1";
    mocks.generateText.mockRejectedValue(
      new TypeError("fetch failed: ECONNREFUSED"),
    );
    const result = await provider.testConnection("m");
    expect(result).toMatchObject({ ok: false, error: "INVALID_BASE_URL" });
  });
});

describe("registry coverage for Phase Q providers", () => {
  it("lists all six providers including the new ones", () => {
    expect(AiProviderRegistry.list().map((p) => p.id)).toEqual([
      "openrouter",
      "openai",
      "gemini",
      "anthropic",
      "openai_compatible",
      "ollama_cloud",
    ]);
  });

  it("accepts gateway-style and ollama-style model ids", () => {
    expect(validateModelForProvider("openai_compatible", "vendor/model-x@v2", [])).toBeNull();
    expect(validateModelForProvider("ollama_cloud", "qwen3-coder:480b-cloud", [])).toBeNull();
    expect(
      validateModelForProvider("ollama_cloud", "has space", []),
    ).toMatch(/cannot be used/);
  });
});
