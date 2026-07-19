import { beforeEach, describe, expect, it, vi } from "vitest";

const { createOpenRouterMock, openRouterModel } = vi.hoisted(() => ({
  createOpenRouterMock: vi.fn(),
  openRouterModel: { provider: "openrouter-compatible" },
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: createOpenRouterMock,
}));

import {
  buildChatAgentModel,
  getChatAgentSetupStatus,
  getChatAgentProviderConfig,
} from "@/server/lib/chatAgentModel";

describe("chat agent model provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOpenRouterMock.mockReturnValue(
      vi.fn().mockReturnValue(openRouterModel),
    );
  });

  it("defaults to OpenRouter and preserves its routing and usage options", () => {
    const config = getChatAgentProviderConfig({
      OPENROUTER_API_KEY: "openrouter-key",
    });

    expect(config.provider).toBe("openrouter");
    expect(buildChatAgentModel(config)).toBe(openRouterModel);
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: "openrouter-key",
    });
    expect(createOpenRouterMock.mock.results[0].value).toHaveBeenCalledWith(
      "minimax/minimax-m3",
      {
        usage: { include: true },
        reasoning: { effort: "medium" },
        provider: {
          order: ["together", "atlas-cloud/fp8"],
          zdr: true,
          allow_fallbacks: true,
        },
      },
    );
  });

  it("uses the configured OpenRouter model", () => {
    const config = getChatAgentProviderConfig({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "openrouter-key",
      OPENROUTER_MODEL: "openrouter/custom",
    });

    buildChatAgentModel(config);

    expect(createOpenRouterMock.mock.results[0].value).toHaveBeenCalledWith(
      "openrouter/custom",
      expect.any(Object),
    );
  });

  it("builds an AI Pass OpenAI-compatible model at the required base URL", () => {
    const config = getChatAgentProviderConfig({
      AI_PROVIDER: "aipass",
      AIPASS_API_KEY: "aipass-key",
      AIPASS_MODEL: "openai/gpt-4.1-mini",
    });

    expect(config.provider).toBe("aipass");
    expect(buildChatAgentModel(config)).toBe(openRouterModel);
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: "aipass-key",
      baseURL: "https://aipass.one/apikey/v1",
      compatibility: "compatible",
    });
    expect(createOpenRouterMock.mock.results[0].value).toHaveBeenCalledWith(
      "openai/gpt-4.1-mini",
    );
  });

  it("reports the selected provider's missing settings", () => {
    expect(() => getChatAgentProviderConfig({ AI_PROVIDER: "aipass" })).toThrow(
      "AIPASS_API_KEY",
    );
    expect(() =>
      getChatAgentProviderConfig({
        AI_PROVIDER: "aipass",
        AIPASS_API_KEY: "key",
      }),
    ).toThrow("AIPASS_MODEL");
    expect(() => getChatAgentProviderConfig({})).toThrow("OPENROUTER_API_KEY");
  });

  it("rejects unsupported provider values", () => {
    expect(() =>
      getChatAgentProviderConfig({ AI_PROVIDER: "unknown" }),
    ).toThrow('AI_PROVIDER must be either "openrouter" or "aipass"');
  });

  it("keeps hosted deployments on OpenRouter for credit metering", () => {
    const config = getChatAgentProviderConfig({
      AUTH_MODE: "hosted",
      AI_PROVIDER: "aipass",
      OPENROUTER_API_KEY: "hosted-openrouter-key",
      AIPASS_API_KEY: "aipass-key",
      AIPASS_MODEL: "model",
    });

    expect(config).toEqual({
      provider: "openrouter",
      apiKey: "hosted-openrouter-key",
      modelId: undefined,
    });
  });

  it("recognizes either fully configured provider at access gates", () => {
    expect(
      getChatAgentSetupStatus({ OPENROUTER_API_KEY: "openrouter-key" }),
    ).toEqual({ enabled: true, errorMessage: null });
    expect(
      getChatAgentSetupStatus({
        AI_PROVIDER: "aipass",
        AIPASS_API_KEY: "aipass-key",
        AIPASS_MODEL: "model",
      }),
    ).toEqual({ enabled: true, errorMessage: null });
    expect(getChatAgentSetupStatus({ AI_PROVIDER: "aipass" })).toEqual({
      enabled: false,
      errorMessage: "AIPASS_API_KEY is required when AI_PROVIDER=aipass",
    });
  });
});
