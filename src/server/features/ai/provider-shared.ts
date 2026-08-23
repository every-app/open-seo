import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { CACHE_TTL, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeProviderError } from "@/server/features/ai/providerErrors";
import type {
  AiConnectionResult,
  AiModel,
  AiProvider,
} from "./providers";

// Shared pieces of the AI provider adapters (see provider-adapters.ts): model
// catalog caching, connection-test probes, and error classification. Nothing
// here knows about a specific provider.

const MODELS_CACHE_TTL = CACHE_TTL.aiModels;

function parsePriceUsd(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Catalog fetch with a best-effort server-side cache. The cached shape is
 * sanity-checked (array of rows with id/name) instead of re-validated against
 * the provider schema — the fetch path is the source of truth, and a stale
 * shape just triggers a re-fetch.
 */
async function cachedModels(
  cacheKey: string,
  fetchModels: () => Promise<AiModel[]>,
): Promise<AiModel[]> {
  const cached: unknown = await getCached(cacheKey);
  if (isModelRowArray(cached)) {
    return cached;
  }
  const models = await fetchModels();
  // Best-effort cache: a failed write just means a re-fetch next time.
  await setCached(cacheKey, models, MODELS_CACHE_TTL).catch(() => {});
  return models;
}

function isModelRow(row: unknown): row is Record<string, unknown> {
  return typeof row === "object" && row !== null;
}

function isModelRowArray(value: unknown): value is AiModel[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isModelRow(row) &&
        typeof row.id === "string" &&
        typeof row.name === "string",
    )
  );
}

/**
 * One-shot generation used by connection tests to verify authentication and
 * model availability. Kept tiny (8 output tokens) so a failing or hanging
 * provider fails fast.
 */
async function probeGeneration(
  model: LanguageModel,
): Promise<{ latencyMs: number }> {
  const startedAt = Date.now();
  await generateText({
    model,
    prompt: "Reply with the single word: ok.",
    maxOutputTokens: 8,
  });
  return { latencyMs: Date.now() - startedAt };
}

/**
 * Best-effort tool-call round-trip: ask the model to call a no-op tool and
 * check that a tool call came back. Fails softly (false) — a refusal here is
 * reported, not fatal, because some providers/models handle a bare tool prompt
 * differently.
 */
async function probeToolCalling(model: LanguageModel): Promise<boolean> {
  const result = await generateText({
    model,
    prompt: "Call the ping tool and report its result.",
    maxOutputTokens: 32,
    tools: {
      ping: {
        description: "No-op probe tool. Returns the word pong.",
        inputSchema: z.object({}),
      },
    },
  });
  return (result.toolCalls?.length ?? 0) > 0;
}

function classifyConnectionError(
  error: unknown,
  modelId: string,
  providerId: string,
): Pick<AiConnectionResult, "ok" | "error" | "message"> {
  const normalized = normalizeProviderError(error, providerId, modelId);
  return {
    ok: false,
    error: normalized.code === "UNKNOWN" ? "unknown" : normalized.code,
    message: normalized.message,
  };
}

function connectionResultForFailure(
  provider: AiProvider,
  modelId: string,
  error: unknown,
  latencyMs: number | null,
): AiConnectionResult {
  const failure = classifyConnectionError(error, modelId, provider.id);
  return {
    ...failure,
    provider: provider.id,
    model: modelId,
    latencyMs,
    capabilities: provider.capabilities,
    toolCallingVerified: false,
  };
}

function missingKeyResult(
  provider: AiProvider,
  modelId: string,
): AiConnectionResult {
  return {
    ok: false,
    error: "AUTH_ERROR",
    message: `${provider.envApiKey} is not configured on this deployment.`,
    provider: provider.id,
    model: modelId,
    latencyMs: null,
    capabilities: provider.capabilities,
    toolCallingVerified: false,
  };
}

/**
 * The connection test itself: tiny generation, then a best-effort tool-call
 * probe when the provider declares tool support. Both probes fail softly —
 * they are reported, never fatal.
 */
async function runConnectionTest(
  provider: AiProvider,
  apiKey: string,
  modelId: string,
): Promise<AiConnectionResult> {
  try {
    const { latencyMs } = await probeGeneration(
      provider.buildModel(apiKey, modelId),
    );
    const toolCallingVerified = await probeToolCalling(
      provider.buildModel(apiKey, modelId),
    ).catch(() => false);
    return {
      ok: true,
      provider: provider.id,
      model: modelId,
      latencyMs,
      capabilities: provider.capabilities,
      toolCallingVerified,
    };
  } catch (error) {
    return connectionResultForFailure(provider, modelId, error, null);
  }
}

export {
  cachedModels,
  missingKeyResult,
  parsePriceUsd,
  runConnectionTest,
};