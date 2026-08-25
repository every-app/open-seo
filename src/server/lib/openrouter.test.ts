import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const modelFactory = vi.fn((..._args: unknown[]) => "model-instance");
  const createOpenRouter = vi.fn((..._args: unknown[]) => modelFactory);
  return { modelFactory, createOpenRouter };
});

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));

describe("buildChatAgentModel", () => {
  beforeEach(() => {
    mocks.createOpenRouter.mockClear();
    mocks.modelFactory.mockClear();
  });

  it("uses OpenRouter with usage metering + provider routing by default", async () => {
    const { buildChatAgentModel } = await import("./openrouter");

    buildChatAgentModel("sk-test", "vendor/model");

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({ apiKey: "sk-test" });
    const firstCall = mocks.modelFactory.mock.calls[0];
    expect(firstCall?.[0]).toBe("vendor/model");
    expect(firstCall?.[1]).toMatchObject({
      usage: { include: true },
      provider: { zdr: true },
    });
  });

  it("routes to a local endpoint and drops OpenRouter-only options when a base URL is set", async () => {
    const { buildChatAgentModel } = await import("./openrouter");

    buildChatAgentModel("", "qwen3.5-9b", "http://localhost:11434/v1");

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "local",
      baseURL: "http://localhost:11434/v1",
    });
    const firstCall = mocks.modelFactory.mock.calls[0];
    expect(firstCall?.[0]).toBe("qwen3.5-9b");
    // No OpenRouter-only options are passed to a generic endpoint.
    expect(firstCall?.[1]).toBeUndefined();
  });

  it("forwards an explicit key to the local endpoint when provided", async () => {
    const { buildChatAgentModel } = await import("./openrouter");

    buildChatAgentModel("sk-local", undefined, "http://vllm:8000/v1");

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "sk-local",
      baseURL: "http://vllm:8000/v1",
    });
  });
});
