import { describe, expect, it, vi } from "vitest";
import { maskApiKey, resolveAiModel } from "./AiSettingsService";

vi.mock("cloudflare:workers", () => ({ env: {} }));

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

describe("maskApiKey", () => {
  it("masks everything but the scheme prefix and last 4 chars", () => {
    expect(maskApiKey("sk-or-v1-abcdefghijklmnop")).toBe("sk-••••mnop");
  });

  it("returns a fixed mask for short or empty keys", () => {
    expect(maskApiKey("")).toBe("••••••••");
    expect(maskApiKey("shortkey")).toBe("••••••••");
  });
});