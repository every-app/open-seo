import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChatAgentModel,
  MINIMAX_M3_PROFILE,
  resolveChatAgentConfig,
} from "./openrouter";

type TestParams = {
  prompt: unknown[];
  providerOptions?: Record<string, Record<string, unknown>>;
};

type TestMiddleware = {
  transformParams: (options: {
    type: "stream";
    params: TestParams;
    model: unknown;
  }) => Promise<TestParams>;
};

type OpenAICompatibleSettings = {
  name: string;
  apiKey: string;
  baseURL: string;
  includeUsage: boolean;
  transformRequestBody: (
    body: Record<string, unknown>,
  ) => Record<string, unknown>;
};

const mocks = vi.hoisted(() => {
  const anthropicModel = { provider: "minimax.anthropic" };
  const anthropicProvider = vi.fn((_modelId: string) => anthropicModel);
  const chatModel = vi.fn((_modelId: string) => ({ provider: "minimax" }));
  const routedModel = vi.fn(() => ({ provider: "routed" }));
  return {
    anthropicModel,
    anthropicProvider,
    chatModel,
    createAnthropic: vi.fn(() => anthropicProvider),
    createOpenAICompatible: vi.fn((_settings: OpenAICompatibleSettings) => ({
      chatModel,
    })),
    createOpenRouter: vi.fn(() => routedModel),
    routedModel,
    wrapLanguageModel: vi.fn(
      ({ model }: { model: unknown; middleware: TestMiddleware }) => model,
    ),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic,
}));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.createOpenAICompatible,
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));
vi.mock("ai", () => ({
  wrapLanguageModel: mocks.wrapLanguageModel,
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of [
    "MINIMAX_API_KEY",
    "MINIMAX_REGION",
    "MINIMAX_API_FORMAT",
    "MINIMAX_THINKING",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
  ]) {
    vi.stubEnv(name, "");
  }
  mocks.anthropicProvider.mockReturnValue(mocks.anthropicModel);
  mocks.createAnthropic.mockReturnValue(mocks.anthropicProvider);
  mocks.createOpenAICompatible.mockReturnValue({ chatModel: mocks.chatModel });
  mocks.createOpenRouter.mockReturnValue(mocks.routedModel);
});

describe("resolveChatAgentConfig", () => {
  it("uses the global Anthropic endpoint with adaptive thinking by default", () => {
    expect(resolveChatAgentConfig({ MINIMAX_API_KEY: "test-key" })).toEqual({
      kind: "minimax",
      apiKey: "test-key",
      region: "global",
      apiFormat: "anthropic",
      thinking: "adaptive",
    });
  });

  it("supports the CN OpenAI endpoint with thinking disabled", () => {
    expect(
      resolveChatAgentConfig({
        MINIMAX_API_KEY: "test-key",
        MINIMAX_REGION: "cn",
        MINIMAX_API_FORMAT: "openai",
        MINIMAX_THINKING: "disabled",
      }),
    ).toMatchObject({
      kind: "minimax",
      region: "cn",
      apiFormat: "openai",
      thinking: "disabled",
    });
  });

  it("rejects unsupported first-party settings", () => {
    expect(() =>
      resolveChatAgentConfig({
        MINIMAX_API_KEY: "test-key",
        MINIMAX_REGION: "unsupported",
      }),
    ).toThrow(/MINIMAX_REGION/);
  });
});

describe("buildChatAgentModel", () => {
  it("configures the global Anthropic endpoint, cache, and adaptive thinking", async () => {
    buildChatAgentModel({
      kind: "minimax",
      apiKey: "test-key",
      region: "global",
      apiFormat: "anthropic",
      thinking: "adaptive",
    });

    expect(mocks.createAnthropic).toHaveBeenCalledWith({
      authToken: "test-key",
      baseURL: "https://api.minimax.io/anthropic/v1",
      name: "minimax.anthropic",
    });
    expect(mocks.anthropicProvider).toHaveBeenCalledWith("MiniMax-M3");

    const middleware = mocks.wrapLanguageModel.mock.calls[0]?.[0].middleware;
    const transformed = await middleware.transformParams({
      type: "stream",
      params: { prompt: [] },
      model: mocks.anthropicModel,
    });
    expect(transformed.providerOptions?.anthropic).toEqual({
      thinking: { type: "adaptive" },
      cacheControl: { type: "ephemeral" },
    });
  });

  it("configures the CN OpenAI endpoint and disabled thinking request body", () => {
    buildChatAgentModel({
      kind: "minimax",
      apiKey: "test-key",
      region: "cn",
      apiFormat: "openai",
      thinking: "disabled",
    });

    const settings = mocks.createOpenAICompatible.mock.calls[0]?.[0];
    expect(settings).toMatchObject({
      name: "minimax",
      apiKey: "test-key",
      baseURL: "https://api.minimaxi.com/v1",
      includeUsage: true,
    });
    expect(settings.transformRequestBody({ messages: [] })).toEqual({
      messages: [],
      thinking: { type: "disabled" },
      reasoning_split: true,
    });
    expect(mocks.chatModel).toHaveBeenCalledWith("MiniMax-M3");
  });

  it("publishes the current context, pricing, cache, and modality metadata", () => {
    expect(MINIMAX_M3_PROFILE).toMatchObject({
      contextWindow: 1_000_000,
      pricingUsdPerMillionTokens: {
        input: 0.6,
        output: 2.4,
        cacheRead: 0.12,
        cacheWrite: null,
      },
      inputModalities: ["text", "image", "video"],
      thinkingModes: ["adaptive", "disabled"],
    });
  });
});
