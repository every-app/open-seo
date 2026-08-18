import { generateText } from "ai";
import { APICallError } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { CACHE_TTL, getCached, setCached } from "@/server/lib/r2-cache";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Provider abstraction for the in-app agent's model settings. Phase O ships
// OpenRouter only; the interface exists so a second provider can slot in
// without touching the agent or the settings UI. Credentials never pass
// through these functions — each provider reads its own key from the
// environment at call time.

export type AiModel = {
  id: string;
  name: string;
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
};

export type AiProvider = {
  id: string;
  displayName: string;
  /** Whether the deployment has a credential configured for this provider. */
  isConfigured(): Promise<boolean>;
  /** Model catalog, cached server-side with a TTL. */
  listModels(): Promise<AiModel[]>;
  /**
   * Cheap generation to verify the credential works and the model responds.
   * Never counts against OpenSEO usage credits — it's billed to the
   * deployment's own provider key.
   */
  testConnection(modelId: string): Promise<AiConnectionResult>;
};

export const SUPPORTED_PROVIDERS = ["openrouter"] as const;
export type AiProviderId = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(id: string): id is AiProviderId {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(id);
}

const MODELS_CACHE_KEY = "ai-models:openrouter";
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

function parsePriceUsd(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseModelRows(
  rows: z.infer<typeof openRouterModelsSchema>["data"],
): AiModel[] {
  return rows
    .filter((model) => model.id && model.name)
    .map((model) => ({
      id: model.id,
      name: model.name,
      contextLength: model.context_length ?? null,
      promptPrice: parsePriceUsd(model.pricing?.prompt),
      completionPrice: parsePriceUsd(model.pricing?.completion),
      supportsTools:
        model.supported_parameters?.includes("tools") ??
        model.supported_parameters?.includes("structuredOutputs") ??
        false,
    }));
}

async function fetchOpenRouterModels(apiKey: string | null | undefined): Promise<AiModel[]> {
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
  return parseModelRows(parsed.data.data);
}

const openRouterProvider: AiProvider = {
  id: "openrouter",
  displayName: "OpenRouter",
  async isConfigured() {
    return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
  },
  async listModels() {
    const cached = await getCached(MODELS_CACHE_KEY);
    if (Array.isArray(cached)) {
      const parsed = openRouterModelsSchema.safeParse({ data: cached });
      if (parsed.success) return parseModelRows(parsed.data.data);
    }
    const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
    const models = await fetchOpenRouterModels(apiKey);
    // Best-effort cache: a failed write just means a re-fetch next time.
    await setCached(MODELS_CACHE_KEY, models, CACHE_TTL.aiModels).catch(
      () => {},
    );
    return models;
  },
  async testConnection(modelId) {
    const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
    if (!apiKey) {
      return {
        ok: false,
        error: "invalid_key",
        message: "OPENROUTER_API_KEY is not configured on this deployment.",
      };
    }
    try {
      await generateText({
        model: createOpenRouterModel(apiKey, modelId),
        prompt: "Reply with the single word: ok.",
        maxOutputTokens: 8,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof APICallError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          return {
            ok: false,
            error: "invalid_key",
            message: "The API key was rejected by the provider.",
          };
        }
        if (error.statusCode === 404) {
          return {
            ok: false,
            error: "model_unavailable",
            message: `The provider returned 404 — model "${modelId}" may be unavailable or misconfigured.`,
          };
        }
      }
      const message =
        error instanceof Error ? error.message : "Unknown provider error";
      return {
        ok: false,
        error: "provider_unreachable",
        message: `Could not reach the provider: ${message}`,
      };
    }
  },
};

function createOpenRouterModel(apiKey: string, modelId: string) {
  return createOpenRouter({ apiKey })(modelId);
}

export const AiProviderRegistry = {
  get(id: string): AiProvider {
    if (id === "openrouter") return openRouterProvider;
    throw new Error(`Unsupported AI provider: ${id}`);
  },
  list(): AiProvider[] {
    return [openRouterProvider];
  },
} as const;