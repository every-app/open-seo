import type { LanguageModel } from "ai";
import { PROVIDER_ADAPTERS } from "./provider-adapters";

// AI provider abstraction for the in-app agent's model settings. Each adapter
// (provider-adapters.ts) owns everything provider-specific — credentials (env
// vars only, never the DB), model discovery, connection testing, model
// construction, and cost extraction. The agent (SAM) and the settings UI
// consume only this contract, so a new provider slots in as a new adapter file
// plus a registry entry without touching either.
//
// Tool calling and streaming are normalized by the `ai` SDK: every
// buildModel() returns a LanguageModel, and generateText/streamText speak the
// same tool-call and stream-chunk contract for all four providers. This module
// therefore adds only what the SDK doesn't cover: the provider list, id
// validation, and published-cost extraction.

export const SUPPORTED_PROVIDERS = [
  "openrouter",
  "openai",
  "gemini",
  "anthropic",
] as const;
export type AiProviderId = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(id: string): id is AiProviderId {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(id);
}

export type AiProviderCapabilities = {
  toolCalling: boolean;
  streaming: boolean;
  modelDiscovery: boolean;
};

export type AiModel = {
  id: string;
  name: string;
  provider: AiProviderId;
  contextLength: number | null;
  /** USD per 1M prompt tokens, when the provider publishes it. */
  promptPrice: number | null;
  /** USD per 1M completion tokens, when the provider publishes it. */
  completionPrice: number | null;
  supportsTools: boolean;
};

export type AiConnectionResult = {
  ok: boolean;
  error?: "invalid_key" | "model_unavailable" | "provider_unreachable" | "unknown";
  message?: string;
  provider: AiProviderId;
  model: string;
  latencyMs: number | null;
  capabilities: AiProviderCapabilities;
  /** True when the test also confirmed a tool call round-trip. */
  toolCallingVerified: boolean;
};

export type AiProvider = {
  id: AiProviderId;
  displayName: string;
  capabilities: AiProviderCapabilities;
  /** Env var that holds this provider's credential. */
  envApiKey: string;
  /** Env var that holds this provider's default model, if any. */
  envModel: string;
  /** Model used when neither settings rows nor env pick one. */
  defaultModelId: string;
  /**
   * Model the connection-test probe runs on when no explicit model is given.
   * Free where the provider offers free models (OpenRouter `:free` variants)
   * so testing a key never costs anything; the built-in default otherwise.
   */
  connectionTestModelId: string;
  /** Whether the deployment has a credential configured for this provider. */
  isConfigured(): Promise<boolean>;
  /**
   * Server-side credential. Never returned to the client, never logged, never
   * stored — callers pass it straight into the SDK model constructor.
   */
  getApiKey(): Promise<string | null>;
  /** Model catalog, cached server-side with a TTL. Empty when unconfigured. */
  listModels(): Promise<AiModel[]>;
  /**
   * Cheap generation to verify the credential works and the model responds,
   * plus a best-effort tool-call probe when the provider declares tool
   * support. Never counts against OpenSEO usage credits — it's billed to the
   * deployment's own provider key.
   */
  testConnection(modelId: string): Promise<AiConnectionResult>;
  /**
   * The AI SDK LanguageModel for this provider. This is the provider-neutral
   * surface the agent consumes: tool calling, streaming, and finish reasons
   * are all normalized by the `ai` SDK.
   */
  buildModel(apiKey: string, modelId: string): LanguageModel;
  /**
   * Real USD cost of a response when the provider publishes it (OpenRouter
   * usage accounting); 0 when the provider doesn't publish pricing per
   * response. Never an estimate — no invented pricing.
   */
  estimateCostUsd(providerMetadata: unknown): number;
};

// ---------------------------------------------------------------------------
// Model-id validation
// ---------------------------------------------------------------------------

// Per-provider model id patterns. Used to reject a model id from one provider
// being paired with another (e.g. "openai/gpt-5" under gemini), and to accept
// manual model entries when the catalog is unavailable. OpenRouter model ids
// embed the owning provider ("google/gemini-2.5-pro"), so its pattern is
// owner/model — the other three have flat ids.
const MODEL_ID_PATTERNS: Record<AiProviderId, RegExp> = {
  openrouter: /^[a-z0-9][\w.-]*\/[a-z0-9][\w.:-]*$/i,
  openai: /^[\w.:-]+$/i,
  gemini: /^(models\/)?gemini-/i,
  anthropic: /^claude-/i,
};

const OPENAI_FOREIGN_PREFIX = /^(gemini-|claude-|models\/)/i;

/**
 * Returns an error message when `modelId` can't belong to `providerId`, or
 * null when it's acceptable. The catalog (when non-empty) is authoritative;
 * otherwise the provider's id pattern is the guard. Save paths REJECT invalid
 * pairs; runtime resolution normalizes them (see AiSettingsService).
 */
export function validateModelForProvider(
  providerId: AiProviderId,
  modelId: string,
  catalog: AiModel[],
): string | null {
  const trimmed = modelId.trim();
  if (!trimmed) return "A model id is required.";
  if (catalog.some((model) => model.id === trimmed)) return null;
  const pattern = MODEL_ID_PATTERNS[providerId];
  if (pattern.test(trimmed)) {
    if (providerId !== "openai" || !OPENAI_FOREIGN_PREFIX.test(trimmed)) {
      return null;
    }
  }
  const expectation = {
    openrouter: 'an id like "openai/gpt-5"',
    openai: 'an id like "gpt-5"',
    gemini: 'an id like "gemini-2.5-flash"',
    anthropic: 'an id like "claude-sonnet-4-5"',
  }[providerId];
  return `Model "${trimmed}" cannot be used with the ${PROVIDER_ADAPTERS[providerId].displayName} provider — expected ${expectation}.`;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const AiProviderRegistry = {
  get(id: string): AiProvider {
    if (!isSupportedProvider(id)) {
      throw new Error(`Unsupported AI provider: ${id}`);
    }
    return PROVIDER_ADAPTERS[id];
  },
  list(): AiProvider[] {
    return SUPPORTED_PROVIDERS.map((id) => PROVIDER_ADAPTERS[id]);
  },
  /** Providers whose credential is present in the deployment environment. */
  async listConfigured(): Promise<AiProvider[]> {
    const providers = this.list();
    const configured: AiProvider[] = [];
    for (const provider of providers) {
      if (await provider.isConfigured()) configured.push(provider);
    }
    return configured;
  },
  /**
   * The provider the deployment env picks when no settings row exists:
   * the AI_AGENT_PROVIDER value when set and supported, else OpenRouter (the
   * built-in default, preserving pre-O2 behavior).
   */
  getEnvDefaultProviderId(envProvider?: string | null): AiProviderId {
    return envProvider && isSupportedProvider(envProvider)
      ? envProvider
      : "openrouter";
  },
} as const;

/**
 * Extracts the real USD cost from a response's provider metadata when the
 * provider publishes it (OpenRouter), else 0. Used by the agents' credit-pool
 * metering; never an estimate.
 */
export function estimateProviderCost(
  providerId: AiProviderId,
  providerMetadata: unknown,
): number {
  return AiProviderRegistry.get(providerId).estimateCostUsd(providerMetadata);
}