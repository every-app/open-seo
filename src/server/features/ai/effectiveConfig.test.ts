import { describe, expect, it, vi } from "vitest";
import {
  resolveEffectiveAiConfig,
  type AiCredentialEnvironment,
} from "./AiSettingsService";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const baseEnv: AiCredentialEnvironment = {
  aiAgentProvider: null,
  aiAgentModel: null,
  providerModelDefaults: {},
  apiKeys: {},
  baseUrls: {},
};

describe("resolveEffectiveAiConfig — provider-aware precedence (S2/S3/S6)", () => {
  it("project provider + organization credential of the SAME provider combine", () => {
    const result = resolveEffectiveAiConfig({
      project: {
        provider: "openai_compatible",
        model: "m",
        baseUrl: "https://a/v1",
      },
      organization: {
        provider: "openai_compatible",
        model: null,
        baseUrl: null,
      },
      projectCredentials: {},
      organizationCredentials: { openai_compatible: "ORG_KEY" },
      env: baseEnv,
    });
    expect(result.provider).toBe("openai_compatible");
    expect(result.baseUrl).toBe("https://a/v1");
    expect(result.baseUrlSource).toBe("project");
    expect(result.credential).toBe("ORG_KEY");
    expect(result.credentialSource).toBe("organization");
    expect(result.model).toBe("m");
  });

  it("never borrows a different provider's credential (S2 example)", () => {
    // Project = Gemini; org only has an OpenAI key; env has a Gemini key →
    // the Gemini env key must win; the OpenAI key must NEVER be used.
    const result = resolveEffectiveAiConfig({
      project: { provider: "gemini", model: null, baseUrl: null },
      organization: { provider: "openai", model: null, baseUrl: null },
      projectCredentials: {},
      organizationCredentials: { openai: "ORG_OPENAI_KEY" },
      env: { ...baseEnv, apiKeys: { gemini: "ENV_GEMINI_KEY" } },
    });
    expect(result.provider).toBe("gemini");
    expect(result.credential).toBe("ENV_GEMINI_KEY");
    expect(result.credentialSource).toBe("environment");
  });

  it("project stored key beats organization key (same provider)", () => {
    const result = resolveEffectiveAiConfig({
      project: { provider: "anthropic", model: null, baseUrl: null },
      organization: null,
      projectCredentials: { anthropic: "PROJECT_KEY" },
      organizationCredentials: { anthropic: "ORG_KEY" },
      env: baseEnv,
    });
    expect(result.credential).toBe("PROJECT_KEY");
    expect(result.credentialSource).toBe("project");
  });

  it("organization stored key beats environment key (same provider)", () => {
    const result = resolveEffectiveAiConfig({
      project: null,
      organization: { provider: "openrouter", model: null, baseUrl: null },
      projectCredentials: {},
      organizationCredentials: { openrouter: "ORG_KEY" },
      env: { ...baseEnv, apiKeys: { openrouter: "ENV_KEY" } },
    });
    expect(result.credential).toBe("ORG_KEY");
    expect(result.credentialSource).toBe("organization");
  });

  it("field-level inheritance: project baseUrl + org key + project model", () => {
    const result = resolveEffectiveAiConfig({
      project: {
        provider: "openai_compatible",
        model: "custom-model",
        baseUrl: "https://gw/v1",
      },
      organization: {
        provider: "openai_compatible",
        model: null,
        baseUrl: null,
      },
      projectCredentials: {},
      organizationCredentials: { openai_compatible: "ORG_KEY" },
      env: baseEnv,
    });
    expect(result.baseUrlSource).toBe("project");
    expect(result.credentialSource).toBe("organization");
    expect(result.model).toBe("custom-model");
  });

  it("higher-scope provider change invalidates lower-scope fields (S3)", () => {
    // Org switched provider to anthropic; the project row is still
    // openai_compatible — its baseUrl/model must NOT apply to anthropic.
    const result = resolveEffectiveAiConfig({
      project: null,
      organization: { provider: "anthropic", model: null, baseUrl: null },
      projectCredentials: { anthropic: "PROJECT_ANTHROPIC" },
      organizationCredentials: { openai_compatible: "ORG_COMPAT" },
      env: baseEnv,
    });
    expect(result.provider).toBe("anthropic");
    expect(result.credential).toBe("PROJECT_ANTHROPIC");
    expect(result.baseUrl).toBeNull();
  });

  it("environment baseUrl applies for endpoint providers without overrides", () => {
    const result = resolveEffectiveAiConfig({
      project: null,
      organization: null,
      projectCredentials: {},
      organizationCredentials: {},
      env: {
        ...baseEnv,
        aiAgentProvider: "ollama_cloud",
        baseUrls: { ollama_cloud: "https://ollama.com/v1" },
        apiKeys: { ollama_cloud: "ENV_OLLAMA" },
      },
    });
    expect(result.provider).toBe("ollama_cloud");
    expect(result.baseUrl).toBe("https://ollama.com/v1");
    expect(result.baseUrlSource).toBe("environment");
    expect(result.credential).toBe("ENV_OLLAMA");
  });

  it("no credential anywhere → none (provider shows Not configured)", () => {
    const result = resolveEffectiveAiConfig({
      project: { provider: "gemini", model: null, baseUrl: null },
      organization: null,
      projectCredentials: {},
      organizationCredentials: {},
      env: baseEnv,
    });
    expect(result.credential).toBeNull();
    expect(result.credentialSource).toBe("none");
  });

  it("unsupported provider strings normalize to openrouter", () => {
    const result = resolveEffectiveAiConfig({
      project: { provider: "not-a-provider", model: null, baseUrl: null },
      organization: null,
      projectCredentials: {},
      organizationCredentials: {},
      env: baseEnv,
    });
    expect(result.provider).toBe("openrouter");
    expect(result.providerSource).toBe("project");
  });
});

// Regression for the 2026-09-01 SAM incident: the org default was
// ollama_cloud, but a stale project row (provider=openrouter, empty model)
// silently routed this project's SAM turns to OpenRouter with the env model
// default. This suite pins BOTH resolutions so operator confusion is caught
// by tests, not by a production 402.
describe("resolveEffectiveAiConfig — incident 2026-09-01 regression (project override + org default)", () => {
  const incidentEnv: AiCredentialEnvironment = {
    aiAgentProvider: null,
    aiAgentModel: null,
    providerModelDefaults: {
      openrouter: "deepseek/deepseek-v4-flash-0731",
    },
    apiKeys: { openrouter: "ENV_OPENROUTER_KEY" },
    baseUrls: {},
  };

  const orgRow = {
    provider: "ollama_cloud",
    model: "kimi-k2.7-code",
    baseUrl: "https://ollama.com/v1",
  };

  const orgCredentials = { ollama_cloud: "ORG_OLLAMA_KEY" };

  it("with the project OpenRouter override: provider=openrouter, model falls through to the env default", () => {
    const result = resolveEffectiveAiConfig({
      project: { provider: "openrouter", model: "", baseUrl: null },
      organization: orgRow,
      projectCredentials: { openrouter: "PROJECT_OPENROUTER_KEY" },
      organizationCredentials: orgCredentials,
      env: incidentEnv,
    });
    expect(result.provider).toBe("openrouter");
    expect(result.providerSource).toBe("project");
    expect(result.model).toBe("deepseek/deepseek-v4-flash-0731");
    expect(result.credential).toBe("PROJECT_OPENROUTER_KEY");
  });

  it("after removing the project override: the org ollama_cloud default takes over", () => {
    const result = resolveEffectiveAiConfig({
      project: null,
      organization: orgRow,
      projectCredentials: {},
      organizationCredentials: orgCredentials,
      env: incidentEnv,
    });
    expect(result.provider).toBe("ollama_cloud");
    expect(result.providerSource).toBe("organization");
    expect(result.model).toBe("kimi-k2.7-code");
    expect(result.credential).toBe("ORG_OLLAMA_KEY");
    expect(result.baseUrl).toBe("https://ollama.com/v1");
  });

  it("an org provider switch invalidates the project row's provider AND its empty-model fall-through", () => {
    // Deleting the project row is the operator remedy; flipping the org row
    // must equally stop the project's openrouter route.
    const result = resolveEffectiveAiConfig({
      project: { provider: "openrouter", model: "", baseUrl: null },
      organization: orgRow,
      projectCredentials: { openrouter: "PROJECT_OPENROUTER_KEY" },
      organizationCredentials: orgCredentials,
      env: incidentEnv,
    });
    expect(result.provider).toBe("openrouter");
    // The project's openrouter credential never leaks into ollama_cloud:
    expect(result.credential).toBe("PROJECT_OPENROUTER_KEY");
    expect(result.baseUrl).toBeNull();
  });
});
