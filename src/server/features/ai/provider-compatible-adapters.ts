import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { AiModel, AiProvider, AiProviderId } from "./providers";
import {
  cachedModels,
  missingKeyResult,
  runConnectionTest,
} from "./provider-shared";
import { checkBaseUrlForDeployment, normalizeBaseUrl } from "./baseUrl";

// OpenAI-compatible endpoints (generic) + Ollama Cloud (Phase Q). Both speak
// the OpenAI wire format through @ai-sdk/openai-compatible:
// {base}/chat/completions with tool calling and streaming, {base}/models for
// discovery. They differ only in configuration surface and defaults, so one
// factory builds them; provider identity stays in the adapter config, never
// in SAM or the UI.

const OLLAMA_CLOUD_DEFAULT_BASE_URL = "https://ollama.com/v1";

type OpenAiCompatibleConfig = {
  id: AiProviderId;
  displayName: string;
  /** SDK-internal provider name stamped into telemetry/metadata. */
  sdkName: string;
  envApiKey: string;
  envModel: string;
  envBaseUrl?: string;
  defaultBaseUrl: string;
  defaultModelId: string;
  /** Whether a missing API key is acceptable (local gateways often need none). */
  keyOptional: boolean;
};

type WarmableAdapter = { baseUrlCache: string | null };

/**
 * Resolve this adapter's Base URL from env (when configured), normalize it,
 * and cache it for the synchronous buildModel path. Returns null when the
 * result is unusable (invalid URL / blocked target).
 */
async function refreshCompatibleBaseUrl(
  config: OpenAiCompatibleConfig,
  target: WarmableAdapter,
): Promise<string | null> {
  const raw = config.envBaseUrl
    ? (await getOptionalEnvValue(config.envBaseUrl)) ?? config.defaultBaseUrl
    : config.defaultBaseUrl;
  const normalized = normalizeBaseUrl(raw);
  // An unusable URL clears any previously-good cache: a deployment whose
  // environment changed (e.g. hosted mode now blocking a private gateway)
  // must fail closed instead of silently reusing the stale endpoint.
  target.baseUrlCache = null;
  if (!normalized) return null;
  const check = await checkBaseUrlForDeployment(normalized);
  if (!check.ok) return null;
  target.baseUrlCache = check.url;
  return check.url;
}

async function fetchOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<AiModel[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${baseUrl}/models`, { headers });
  if (!response.ok) {
    throw new Error(`Model catalog returned ${response.status}`);
  }
  const payload = z
    .object({
      data: z.array(z.object({ id: z.string() })),
    })
    .safeParse(await response.json());
  if (!payload.success) return [];
  return payload.data.data.map((model) => ({
    id: model.id,
    name: model.id,
    provider: "openai_compatible" as AiProviderId,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    supportsTools: false,
  }));
}

function mapProviderId(
  models: AiModel[],
  providerId: AiProviderId,
): AiModel[] {
  return models.map((model) => ({ ...model, provider: providerId }));
}

function createOpenAiCompatibleAdapter(
  config: OpenAiCompatibleConfig,
): AiProvider {
  // S17: catalog cache identity is provider + normalized Base URL — Gateway A
  // and Gateway B must never share a cached catalog.
  const cacheKeyFor = (base: string): string =>
    `ai-models:${config.id}:${base}`;
  // Synchronous buildModel can't await env, so the resolved Base URL is
  // warmed by every async seam (prepare/isConfigured/listModels/test) and
  // read from this cache on the hot path.
  const state: WarmableAdapter = { baseUrlCache: null };
  const currentBase = (): string | null => state.baseUrlCache;

  /**
   * Merge the EFFECTIVE config (stored/unsaved edits) over the deployment
   * env: explicit Base URL wins, explicit key wins, else env-resolved.
   */
  const resolveEndpoint = async (
    opts?: { baseUrl?: string; apiKey?: string },
  ): Promise<{ base: string | null; apiKey: string | null }> => {
    if (opts?.baseUrl) {
      const normalized = normalizeBaseUrl(opts.baseUrl);
      const check = await checkBaseUrlForDeployment(normalized);
      return { base: check.ok ? check.url : null, apiKey: opts.apiKey ?? (await getOptionalEnvValue(config.envApiKey)) ?? null };
    }
    const base =
      (await refreshCompatibleBaseUrl(config, state)) ?? currentBase();
    return {
      base,
      apiKey: opts?.apiKey ?? (await getOptionalEnvValue(config.envApiKey)) ?? null,
    };
  };

  return {
    id: config.id,
    displayName: config.displayName,
    credentialOptional: config.keyOptional,
    capabilities: {
      toolCalling: true,
      streaming: true,
      modelDiscovery: true,
    },
    envApiKey: config.envApiKey,
    envModel: config.envModel,
    defaultModelId: config.defaultModelId,
    connectionTestModelId: config.defaultModelId,
    async prepare() {
      await refreshCompatibleBaseUrl(config, state);
    },
    async baseUrl() {
      return (await refreshCompatibleBaseUrl(config, state)) ?? currentBase();
    },
    async isConfigured() {
      const base =
        (await refreshCompatibleBaseUrl(config, state)) ?? currentBase();
      if (!base) return false;
      if (!config.keyOptional) {
        return Boolean(await getOptionalEnvValue(config.envApiKey));
      }
      return true;
    },
    async getApiKey() {
      return (await getOptionalEnvValue(config.envApiKey)) ?? null;
    },
    async listModels(opts) {
      const { base, apiKey } = await resolveEndpoint(opts);
      if (!base) return [];
      try {
        const models = await cachedModels(
          cacheKeyFor(base),
          () => fetchOpenAiCompatibleModels(base, apiKey),
          { refresh: opts?.refresh },
        );
        return mapProviderId(models, config.id);
      } catch {
        // Discovery is best-effort — manual model entry covers the rest.
        return [];
      }
    },
    async testConnection(modelId, opts) {
      const { base, apiKey } = await resolveEndpoint(opts);
      if (!base) {
        return {
          ok: false,
          error: "INVALID_BASE_URL",
          message: config.envBaseUrl
            ? `${config.envBaseUrl} is not configured or is not a valid, allowed Base URL.`
            : "The provider Base URL is invalid.",
          provider: this.id,
          model: modelId,
          latencyMs: null,
          capabilities: this.capabilities,
          toolCallingVerified: false,
        };
      }
      if (!apiKey && !config.keyOptional) {
        return missingKeyResult(this, modelId);
      }
      return runConnectionTest(this, apiKey ?? "", modelId);
    },
    buildModel(apiKey, modelId, opts) {
      const explicit = opts?.baseUrl
        ? normalizeBaseUrl(opts.baseUrl)
        : null;
      const base = explicit ?? currentBase();
      if (!base) {
        throw new Error(
          config.envBaseUrl
            ? `${config.envBaseUrl} is not configured — set it to this provider's OpenAI-compatible Base URL before use.`
            : "The provider Base URL is not configured.",
        );
      }
      return createOpenAICompatible({
        name: config.sdkName,
        baseURL: base,
        apiKey: apiKey || undefined,
      }).chatModel(modelId);
    },
    estimateCostUsd() {
      return 0;
    },
  };
}

export const openAiCompatibleProvider = createOpenAiCompatibleAdapter({
  id: "openai_compatible",
  displayName: "OpenAI Compatible",
  sdkName: "openai-compatible",
  envApiKey: "OPENAI_COMPATIBLE_API_KEY",
  envModel: "OPENAI_COMPATIBLE_MODEL",
  envBaseUrl: "OPENAI_COMPATIBLE_BASE_URL",
  // Most compatible gateways speak common OpenAI model names; operators
  // should set OPENAI_COMPATIBLE_MODEL to their gateway's real model.
  defaultBaseUrl: "",
  defaultModelId: "gpt-4o-mini",
  keyOptional: true,
});

export const ollamaCloudProvider = createOpenAiCompatibleAdapter({
  id: "ollama_cloud",
  displayName: "Ollama Cloud",
  sdkName: "ollama-cloud",
  envApiKey: "OLLAMA_API_KEY",
  envModel: "OLLAMA_CLOUD_MODEL",
  envBaseUrl: "OLLAMA_CLOUD_BASE_URL",
  defaultBaseUrl: OLLAMA_CLOUD_DEFAULT_BASE_URL,
  // Ollama's documented cloud flagship; override via OLLAMA_CLOUD_MODEL.
  defaultModelId: "qwen3-coder:480b-cloud",
  keyOptional: false,
});