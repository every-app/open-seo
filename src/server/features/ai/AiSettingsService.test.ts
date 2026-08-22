import { describe, expect, it, vi } from "vitest";
import {
  assertValidModelPair,
  getProviderStatuses,
  maskApiKey,
  resolveAiModel,
  resolveAiSettings,
} from "./AiSettingsService";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const multiProviderEnv = (overrides: Partial<{
  aiAgentProvider: string | null;
  aiAgentModel: string | null;
  providerModelDefaults: Record<string, string | null>;
}> = {}) => ({
  aiAgentProvider: null,
  aiAgentModel: null,
  providerModelDefaults: {},
  ...overrides,
});

describe("resolveAiModel", () => {
  const emptyEnv = { aiAgentModel: null, openRouterModel: null };

  it("prefers the project row over the organization row", () => {
    const result = resolveAiModel(
      {
        project: { provider: "openrouter", model: "project/model" },
        organization: { provider: "openrouter", model: "org/model" },
      },
      emptyEnv,
    );
    expect(result).toEqual({
      provider: "openrouter",
      model: "project/model",
    });
  });

  it("falls back to the organization row when the project inherits", () => {
    const result = resolveAiModel(
      {
        project: null,
        organization: { provider: "openrouter", model: "org/model" },
      },
      emptyEnv,
    );
    expect(result).toEqual({ provider: "openrouter", model: "org/model" });
  });

  it("skips a project row with an empty model (inherit)", () => {
    const result = resolveAiModel(
      {
        project: { provider: "openrouter", model: null },
        organization: { provider: "openrouter", model: "org/model" },
      },
      emptyEnv,
    );
    expect(result).toEqual({ provider: "openrouter", model: "org/model" });
  });

  it("falls back to AI_AGENT_MODEL then OPENROUTER_MODEL when no row exists", () => {
    expect(
      resolveAiModel(
        { project: null, organization: null },
        { aiAgentModel: "agent/model", openRouterModel: "legacy/model" },
      ),
    ).toEqual({ provider: "openrouter", model: "agent/model" });
    expect(
      resolveAiModel(
        { project: null, organization: null },
        { aiAgentModel: null, openRouterModel: "legacy/model" },
      ),
    ).toEqual({ provider: "openrouter", model: "legacy/model" });
  });

  it("returns a null model when nothing is configured (built-in default wins)", () => {
    expect(resolveAiModel({ project: null, organization: null }, emptyEnv)).toEqual({
      provider: "openrouter",
      model: null,
    });
  });
});

describe("resolveAiSettings (multi-provider)", () => {

  it("keeps the project row's provider and model across providers", () => {
    const result = resolveAiSettings(
      {
        project: { provider: "openai", model: "gpt-5" },
        organization: { provider: "gemini", model: "gemini-2.5-pro" },
      },
      multiProviderEnv(),
    );
    expect(result).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("falls back to the organization row with its own provider", () => {
    const result = resolveAiSettings(
      {
        project: null,
        organization: { provider: "anthropic", model: "claude-sonnet-4-5" },
      },
      multiProviderEnv(),
    );
    expect(result).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    });
  });

  it("uses AI_AGENT_PROVIDER with AI_AGENT_MODEL when no settings row exists", () => {
    const result = resolveAiSettings(
      { project: null, organization: null },
      multiProviderEnv({ aiAgentProvider: "gemini", aiAgentModel: "gemini-2.5-flash" }),
    );
    expect(result).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("falls back to the provider's own env model default", () => {
    const result = resolveAiSettings(
      { project: null, organization: null },
      multiProviderEnv({
        aiAgentProvider: "anthropic",
        providerModelDefaults: { anthropic: "claude-haiku-4-5" },
      }),
    );
    expect(result).toEqual({ provider: "anthropic", model: "claude-haiku-4-5" });
  });

  it("ignores an unsupported AI_AGENT_PROVIDER value", () => {
    const result = resolveAiSettings(
      { project: null, organization: null },
      multiProviderEnv({
        aiAgentProvider: "not-a-provider",
        aiAgentModel: "some/model",
        providerModelDefaults: { openrouter: "minimax/minimax-m3" },
      }),
    );
    expect(result).toEqual({ provider: "openrouter", model: "some/model" });
  });

  it("normalizes a foreign model id on the effective provider to null", () => {
    const result = resolveAiSettings(
      {
        project: { provider: "openai", model: "claude-sonnet-4-5" },
        organization: null,
      },
      multiProviderEnv(),
    );
    expect(result).toEqual({ provider: "openai", model: null });
  });

  it("normalizes a gemini id on openai to null", () => {
    const result = resolveAiSettings(
      {
        project: { provider: "openai", model: "gemini-2.5-flash" },
        organization: null,
      },
      multiProviderEnv(),
    );
    expect(result).toEqual({ provider: "openai", model: null });
  });

  it("accepts an openrouter-style id only on openrouter", () => {
    const ok = resolveAiSettings(
      { project: { provider: "openrouter", model: "google/gemini-2.5-pro" }, organization: null },
      multiProviderEnv(),
    );
    expect(ok).toEqual({ provider: "openrouter", model: "google/gemini-2.5-pro" });
    const normalized = resolveAiSettings(
      { project: { provider: "gemini", model: "google/gemini-2.5-pro" }, organization: null },
      multiProviderEnv(),
    );
    expect(normalized).toEqual({ provider: "gemini", model: null });
  });
});

describe("assertValidModelPair", () => {
  it("rejects an unsupported provider", () => {
    expect(() => assertValidModelPair("not-a-provider", "gpt-5")).toThrow(
      /Unsupported AI provider/,
    );
  });

  it("rejects a model id from another provider", () => {
    expect(() => assertValidModelPair("gemini", "gpt-5")).toThrow(
      /cannot be used with the Google Gemini provider/,
    );
    expect(() => assertValidModelPair("anthropic", "gemini-2.5-flash")).toThrow(
      /cannot be used with the Anthropic provider/,
    );
    expect(() => assertValidModelPair("openai", "claude-sonnet-4-5")).toThrow(
      /cannot be used with the OpenAI provider/,
    );
  });

  it("accepts valid pairs and null models", () => {
    expect(() => assertValidModelPair("openrouter", "openai/gpt-5")).not.toThrow();
    expect(() => assertValidModelPair("openai", "gpt-5")).not.toThrow();
    expect(() => assertValidModelPair("gemini", "gemini-2.5-flash")).not.toThrow();
    expect(() => assertValidModelPair("anthropic", "claude-sonnet-4-5")).not.toThrow();
    expect(() => assertValidModelPair("openai", null)).not.toThrow();
  });
});

describe("getProviderStatuses", () => {
  it("flags configured providers with a masked key and unconfigured ones without", async () => {
    const statuses = await getProviderStatuses({
      openrouter: "sk-or-v1-abcdefghijklmnop",
      gemini: null,
    });
    const byId = Object.fromEntries(statuses.map((entry) => [entry.id, entry]));
    expect(byId.openrouter.configured).toBe(true);
    expect(byId.openrouter.maskedApiKey).toBe("sk-••••mnop");
    expect(byId.openrouter.envApiKey).toBe("OPENROUTER_API_KEY");
    expect(byId.gemini.configured).toBe(false);
    expect(byId.gemini.maskedApiKey).toBeNull();
    expect(byId.gemini.envApiKey).toBe("GEMINI_API_KEY");
  });

  it("never returns a plaintext key", async () => {
    const statuses = await getProviderStatuses({ openai: "sk-very-secret-1234" });
    expect(JSON.stringify(statuses)).not.toContain("very-secret");
  });
});

describe("maskApiKey", () => {
  it("masks everything but the scheme prefix and last 4 chars", () => {
    expect(maskApiKey("sk-or-v1-abcdefghijklmnop")).toBe("sk-••••mnop");
  });

  it("returns a fixed mask for short or empty keys", () => {
    expect(maskApiKey("")).toBe("••••••••");
    expect(maskApiKey("shortkey")).toBe("••••••••");
  });
});