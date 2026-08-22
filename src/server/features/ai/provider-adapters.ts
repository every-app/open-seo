import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type {
  AiModel,
  AiProvider,
  AiProviderId,
} from "./providers";
import {
  cachedModels,
  missingKeyResult,
  parsePriceUsd,
  runConnectionTest,
} from "./provider-shared";

// The four provider adapters. Each owns everything provider-specific —
// credentials (env vars only, never the DB), model discovery, connection
// testing, model construction, and cost extraction. The registry in
// providers.ts exposes them to SAM and the settings UI through the AiProvider
// interface only, so a new provider is a new file plus a registry entry.

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// OpenRouter's models endpoint is public (no auth), so the catalog can be
// fetched and cached even before a key is configured.
const openRouterModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      context_length: z.number().nullish(),
      pricing: z
        .object({
          prompt: z.string().nullish(),
          completion: z.string().nullish(),
        })
        .nullish(),
      supported_parameters: z.array(z.string()).nullish(),
    }),
  ),
});

function parseOpenRouterRows(
  rows: z.infer<typeof openRouterModelsSchema>["data"],
): AiModel[] {
  return rows
    .filter((model) => model.id && model.name)
    .map((model) => ({
      id: model.id,
      name: model.name,
      provider: "openrouter" as const,
      contextLength: model.context_length ?? null,
      promptPrice: parsePriceUsd(model.pricing?.prompt),
      completionPrice: parsePriceUsd(model.pricing?.completion),
      supportsTools:
        model.supported_parameters?.includes("tools") ??
        model.supported_parameters?.includes("structuredOutputs") ??
        false,
    }));
}

async function fetchOpenRouterModels(
  apiKey: string | null | undefined,
): Promise<AiModel[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(OPENROUTER_MODELS_URL, { headers });
  if (!response.ok) {
    throw new Error(
      `OpenRouter models request failed with status ${response.status}`,
    );
  }
  const parsed = openRouterModelsSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("OpenRouter models response did not match the expected shape");
  }
  return parseOpenRouterRows(parsed.data.data);
}

const openRouterUsageSchema = z.object({
  openrouter: z.object({ usage: z.object({ cost: z.number() }) }),
});

const openRouterProvider: AiProvider = {
  id: "openrouter",
  displayName: "OpenRouter",
  capabilities: {
    toolCalling: true,
    streaming: true,
    modelDiscovery: true,
  },
  envApiKey: "OPENROUTER_API_KEY",
  envModel: "OPENROUTER_MODEL",
  defaultModelId: "minimax/minimax-m3",
  // Free OpenRouter model for the connection-test probe so testing a key costs
  // nothing. Tool-capable so the tool-call round-trip can be verified too.
  connectionTestModelId: "z-ai/glm-5.2:free",
  async isConfigured() {
    return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
  },
  async getApiKey() {
    return (await getOptionalEnvValue("OPENROUTER_API_KEY")) ?? null;
  },
  async listModels() {
    const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
    return cachedModels("ai-models:openrouter", () =>
      fetchOpenRouterModels(apiKey),
    );
  },
  async testConnection(modelId) {
    const apiKey = await this.getApiKey();
    if (!apiKey) return missingKeyResult(this, modelId);
    return runConnectionTest(this, apiKey, modelId);
  },
  buildModel(apiKey, modelId) {
    // usage: { include: true } turns on OpenRouter usage accounting so each
    // response carries its real USD cost (providerMetadata.openrouter.usage.
    // cost), which estimateCostUsd() reads for credit-pool metering.
    // `provider.order` prefers Together, then Atlas Cloud (fp8); `zdr: true`
    // restricts routing to Zero-Data-Retention endpoints; fallbacks stay on
    // within the ZDR set (pin-only caused a prod outage Jul 2026). The
    // `reasoning` channel keeps chain-of-thought out of the visible text.
    return createOpenRouter({ apiKey })(
      modelId,
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
  },
  estimateCostUsd(providerMetadata) {
    const parsed = openRouterUsageSchema.safeParse(providerMetadata);
    return parsed.success ? parsed.data.openrouter.usage.cost : 0;
  },
};

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

const openAiModelsSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

// OpenAI's /models endpoint returns flat ids with no names, capabilities, or
// pricing — so rows carry the id as display name, null pricing, and a
// conservative tool-support guess from the id family. No names are invented;
// the list itself comes from the API.
function inferOpenAiTools(modelId: string): boolean {
  return /^(gpt-|o1|o3|o4|chatgpt-|ft:gpt-)/i.test(modelId);
}

async function fetchOpenAiModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch(OPENAI_MODELS_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenAI models request failed with status ${response.status}`);
  }
  const parsed = openAiModelsSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("OpenAI models response did not match the expected shape");
  }
  return parsed.data.data.map((row) => ({
    id: row.id,
    name: row.id,
    provider: "openai" as const,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: inferOpenAiTools(row.id),
  }));
}

const openAiProvider: AiProvider = {
  id: "openai",
  displayName: "OpenAI",
  capabilities: {
    toolCalling: true,
    streaming: true,
    modelDiscovery: true,
  },
  envApiKey: "OPENAI_API_KEY",
  envModel: "OPENAI_MODEL",
  defaultModelId: "gpt-5",
  connectionTestModelId: "gpt-5",
  async isConfigured() {
    return Boolean(await getOptionalEnvValue("OPENAI_API_KEY"));
  },
  async getApiKey() {
    return (await getOptionalEnvValue("OPENAI_API_KEY")) ?? null;
  },
  async listModels() {
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];
    return cachedModels("ai-models:openai", () => fetchOpenAiModels(apiKey));
  },
  async testConnection(modelId) {
    const apiKey = await this.getApiKey();
    if (!apiKey) return missingKeyResult(this, modelId);
    return runConnectionTest(this, apiKey, modelId);
  },
  buildModel(apiKey, modelId) {
    return createOpenAI({ apiKey })(modelId);
  },
  // OpenAI responses don't carry USD pricing; the SDK reports token usage,
  // but per-model prices aren't published in responses. No invented pricing.
  estimateCostUsd() {
    return 0;
  },
};

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------

const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const geminiModelsSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string().nullish(),
      supportedGenerationMethods: z.array(z.string()).nullish(),
    }),
  ),
});

// Gemini's list endpoint names models "models/gemini-2.5-flash"; we store the
// bare id (what the SDK accepts) and keep only models that can generate
// content. No pricing is published in this response, so prices stay null.
async function fetchGeminiModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch(`${GEMINI_MODELS_URL}?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) {
    throw new Error(
      `Gemini models request failed with status ${response.status}`,
    );
  }
  const parsed = geminiModelsSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Gemini models response did not match the expected shape");
  }
  return parsed.data.models
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
    .map((model) => {
      const id = model.name.replace(/^models\//, "");
      return {
        id,
        name: model.displayName ?? id,
        provider: "gemini" as const,
        contextLength: null,
        promptPrice: null,
        completionPrice: null,
        supportsTools: /^gemini-/i.test(id),
      };
    });
}

const geminiProvider: AiProvider = {
  id: "gemini",
  displayName: "Google Gemini",
  capabilities: {
    toolCalling: true,
    streaming: true,
    modelDiscovery: true,
  },
  envApiKey: "GEMINI_API_KEY",
  envModel: "GEMINI_MODEL",
  defaultModelId: "gemini-2.5-flash",
  connectionTestModelId: "gemini-2.5-flash",
  async isConfigured() {
    return Boolean(await getOptionalEnvValue("GEMINI_API_KEY"));
  },
  async getApiKey() {
    return (await getOptionalEnvValue("GEMINI_API_KEY")) ?? null;
  },
  async listModels() {
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];
    return cachedModels("ai-models:gemini", () => fetchGeminiModels(apiKey));
  },
  async testConnection(modelId) {
    const apiKey = await this.getApiKey();
    if (!apiKey) return missingKeyResult(this, modelId);
    return runConnectionTest(this, apiKey, modelId);
  },
  buildModel(apiKey, modelId) {
    return createGoogleGenerativeAI({ apiKey })(modelId);
  },
  estimateCostUsd() {
    return 0;
  },
};

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";

const anthropicModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_name: z.string().nullish(),
    }),
  ),
});

async function fetchAnthropicModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch(ANTHROPIC_MODELS_URL, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic models request failed with status ${response.status}`,
    );
  }
  const parsed = anthropicModelsSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Anthropic models response did not match the expected shape");
  }
  return parsed.data.data.map((row) => ({
    id: row.id,
    name: row.display_name ?? row.id,
    provider: "anthropic" as const,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: /^claude-/i.test(row.id),
  }));
}

const anthropicProvider: AiProvider = {
  id: "anthropic",
  displayName: "Anthropic",
  capabilities: {
    toolCalling: true,
    streaming: true,
    modelDiscovery: true,
  },
  envApiKey: "ANTHROPIC_API_KEY",
  envModel: "ANTHROPIC_MODEL",
  defaultModelId: "claude-sonnet-4-5",
  connectionTestModelId: "claude-sonnet-4-5",
  async isConfigured() {
    return Boolean(await getOptionalEnvValue("ANTHROPIC_API_KEY"));
  },
  async getApiKey() {
    return (await getOptionalEnvValue("ANTHROPIC_API_KEY")) ?? null;
  },
  async listModels() {
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];
    return cachedModels("ai-models:anthropic", () =>
      fetchAnthropicModels(apiKey),
    );
  },
  async testConnection(modelId) {
    const apiKey = await this.getApiKey();
    if (!apiKey) return missingKeyResult(this, modelId);
    return runConnectionTest(this, apiKey, modelId);
  },
  buildModel(apiKey, modelId) {
    return createAnthropic({ apiKey })(modelId);
  },
  estimateCostUsd() {
    return 0;
  },
};

export const PROVIDER_ADAPTERS: Record<AiProviderId, AiProvider> = {
  openrouter: openRouterProvider,
  openai: openAiProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
};