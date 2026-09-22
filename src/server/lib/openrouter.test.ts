import { describe, expect, it, vi, beforeEach } from "vitest";

const createOpenRouterMock = vi.fn();
const modelFnMock = vi.fn<(model: string, opts?: unknown) => void>();

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (...args: unknown[]) => {
    createOpenRouterMock(...args);
    return (model: string, opts?: unknown) => {
      modelFnMock(model, opts);
      return { modelId: model, opts };
    };
  },
}));

import { buildChatAgentModel, buildChatAgentModelFromEnv } from "./openrouter";

describe("buildChatAgentModel", () => {
  beforeEach(() => {
    createOpenRouterMock.mockClear();
    modelFnMock.mockClear();
  });

  it("passes no baseURL to createOpenRouter when unset (defaults to openrouter.ai)", () => {
    buildChatAgentModel("test-key");
    expect(createOpenRouterMock).toHaveBeenCalledWith({ apiKey: "test-key" });
  });

  it("forwards baseURL when provided", () => {
    buildChatAgentModel("test-key", undefined, "max", "https://example.com/v1");
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://example.com/v1",
    });
  });

  it("sends usage accounting and reasoning extraBody on the default endpoint", () => {
    buildChatAgentModel("test-key");
    const opts = modelFnMock.mock.calls[0][1];
    expect(opts).toEqual({
      usage: { include: true },
      extraBody: { reasoning: { effort: "max" } },
    });
  });

  it("sends a plain request (no usage/extraBody) on a custom endpoint", () => {
    buildChatAgentModel("test-key", undefined, "max", "https://example.com/v1");
    const opts = modelFnMock.mock.calls[0][1];
    expect(opts).toBeUndefined();
  });

  it("keeps the hosted default model slug when no override is given", () => {
    buildChatAgentModel("test-key");
    expect(modelFnMock.mock.calls[0][0]).toBe("openai/gpt-5.6-luna");
  });
});

describe("buildChatAgentModelFromEnv", () => {
  beforeEach(() => {
    createOpenRouterMock.mockClear();
    modelFnMock.mockClear();
  });

  it("throws when OPENROUTER_API_KEY is missing", () => {
    expect(() => buildChatAgentModelFromEnv({})).toThrow(
      "OPENROUTER_API_KEY is required for the SAM agent",
    );
  });

  it("reads the key, model and base URL from the env record", () => {
    buildChatAgentModelFromEnv({
      OPENROUTER_API_KEY: "env-key",
      OPENROUTER_MODEL: "custom-model",
      OPENROUTER_BASE_URL: "https://example.com/v1",
    });
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: "env-key",
      baseURL: "https://example.com/v1",
    });
    expect(modelFnMock).toHaveBeenCalledWith("custom-model", undefined);
  });
});
