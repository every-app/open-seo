import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireChatAgentProvider,
  resolveChatAgentProvider,
} from "./chatAgentModel";

vi.mock("cloudflare:workers", () => ({ env: {} }));

// getEnvValueSync reads process.env before the passed env record, so the
// machine running the tests must not decide the outcome.
beforeEach(() => {
  for (const name of [
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
  ]) {
    vi.stubEnv(name, "");
  }
});

describe("resolveChatAgentProvider", () => {
  it("returns null when no key is configured", () => {
    expect(resolveChatAgentProvider({})).toBeNull();
  });

  it("uses OpenRouter with the default model", () => {
    expect(resolveChatAgentProvider({ OPENROUTER_API_KEY: "or-key" })).toEqual({
      kind: "openrouter",
      apiKey: "or-key",
      modelId: "minimax/minimax-m3",
    });
  });

  it("honours the OpenRouter model override", () => {
    const provider = resolveChatAgentProvider({
      OPENROUTER_API_KEY: "or-key",
      OPENROUTER_MODEL: "openai/gpt-4o",
    });
    expect(provider).toMatchObject({ modelId: "openai/gpt-4o" });
  });

  it("defaults the OpenAI-compatible path to LLMTR", () => {
    expect(resolveChatAgentProvider({ LLM_API_KEY: "gateway-key" })).toEqual({
      kind: "openai-compatible",
      apiKey: "gateway-key",
      baseUrl: "https://llmtr.com/v1",
      modelId: "minimax/minimax-m3",
    });
  });

  it("honours a custom gateway base URL and model", () => {
    expect(
      resolveChatAgentProvider({
        LLM_API_KEY: "gateway-key",
        LLM_BASE_URL: "http://localhost:11434/v1",
        LLM_MODEL: "qwen3:8b",
      }),
    ).toEqual({
      kind: "openai-compatible",
      apiKey: "gateway-key",
      baseUrl: "http://localhost:11434/v1",
      modelId: "qwen3:8b",
    });
  });

  // A deployment switching away from OpenRouter shouldn't have to delete the
  // old secret first.
  it("prefers the gateway key when both are set", () => {
    const provider = resolveChatAgentProvider({
      LLM_API_KEY: "gateway-key",
      OPENROUTER_API_KEY: "or-key",
    });
    expect(provider).toMatchObject({ kind: "openai-compatible" });
  });
});

describe("requireChatAgentProvider", () => {
  it("throws when no key is configured", () => {
    expect(() => requireChatAgentProvider({})).toThrow(
      /Missing chat agent credentials/,
    );
  });
});
