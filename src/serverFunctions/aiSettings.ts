import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  AiProviderRegistry,
  SUPPORTED_PROVIDERS,
  isSupportedProvider,
  type AiModel,
  type AiConnectionResult,
} from "@/server/features/ai/providers";
import {
  getAiSettingsOverview,
  getProviderStatuses,
  updateOrganizationAiSettings,
  updateProjectAiSettings as saveProjectAiSettings,
  assertValidModelPair,
  type ResolvedAiSettings,
  type AiProviderStatus,
  type AiModelEnvironment,
} from "@/server/features/ai/AiSettingsService";

const settingsSchema = z.object({
  provider: z.string().refine(isSupportedProvider),
  model: z.string().max(120).optional(),
});

const providerSchema = z.enum(SUPPORTED_PROVIDERS);

// The env values every settings read needs: the deployment-wide provider/model
// override plus each provider's own key and default model. Keys stay
// server-side — only masked presence ever reaches the client.
async function readAiEnvironment(): Promise<{
  env: AiModelEnvironment;
  apiKeys: Record<typeof SUPPORTED_PROVIDERS[number], string | null>;
}> {
  const env: AiModelEnvironment = {
    aiAgentProvider: (await getOptionalEnvValue("AI_AGENT_PROVIDER")) ?? null,
    aiAgentModel: (await getOptionalEnvValue("AI_AGENT_MODEL")) ?? null,
    providerModelDefaults: {
      openrouter: (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? null,
      openai: (await getOptionalEnvValue("OPENAI_MODEL")) ?? null,
      gemini: (await getOptionalEnvValue("GEMINI_MODEL")) ?? null,
      anthropic: (await getOptionalEnvValue("ANTHROPIC_MODEL")) ?? null,
    },
  };
  const apiKeys = {
    openrouter: (await getOptionalEnvValue("OPENROUTER_API_KEY")) ?? null,
    openai: (await getOptionalEnvValue("OPENAI_API_KEY")) ?? null,
    gemini: (await getOptionalEnvValue("GEMINI_API_KEY")) ?? null,
    anthropic: (await getOptionalEnvValue("ANTHROPIC_API_KEY")) ?? null,
  };
  return { env, apiKeys };
}

export type AiSettingsView = {
  organization: { provider: string; model: string | null } | null;
  project: { provider: string; model: string | null } | null;
  effective: ResolvedAiSettings;
  providers: AiProviderStatus[];
  apiKeyConfigured: boolean;
  maskedApiKey: string | null;
};

// Global (organization) AI settings: provider + default model. Credentials are
// never stored or returned — masked key status per provider is derived from
// the server-side deployment secrets.
export const getGlobalAiSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }): Promise<AiSettingsView> => {
    const { env, apiKeys } = await readAiEnvironment();
    const overview = await getAiSettingsOverview({
      organizationId: context.organizationId,
      projectId: null,
      env,
      apiKeys,
    });
    return {
      organization: overview.organization,
      project: null,
      effective: overview.effective,
      providers: overview.providers,
      apiKeyConfigured: overview.apiKeyConfigured,
      maskedApiKey: overview.maskedApiKey,
    };
  });

export const updateGlobalAiSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(settingsSchema)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    assertValidModelPair(
      data.provider,
      data.model?.trim() ? data.model.trim() : null,
    );
    await updateOrganizationAiSettings(context.organizationId, {
      provider: data.provider,
      model: data.model?.trim() ? data.model.trim() : null,
    });
    return { ok: true };
  });

// Project-level override. Sending model: null clears the override so the
// project inherits the organization default (or the environment default).
export const getProjectAiSettings = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }): Promise<AiSettingsView> => {
    const { env, apiKeys } = await readAiEnvironment();
    const overview = await getAiSettingsOverview({
      organizationId: context.organizationId,
      projectId: context.projectId,
      env,
      apiKeys,
    });
    return {
      project: overview.project,
      organization: null,
      effective: overview.effective,
      providers: overview.providers,
      apiKeyConfigured: overview.apiKeyConfigured,
      maskedApiKey: overview.maskedApiKey,
    };
  });

export const updateProjectAiSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      provider: z.string().refine(isSupportedProvider),
      model: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    assertValidModelPair(
      data.provider,
      data.model?.trim() ? data.model.trim() : null,
    );
    await saveProjectAiSettings(context.projectId, {
      provider: data.provider,
      model: data.model?.trim() ? data.model.trim() : null,
    });
    return { ok: true };
  });

// Provider model catalog for the settings UI. Cached server-side per provider
// (see providers.ts); returns the full list and lets the client filter.
export const listAiModels = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ provider: providerSchema }))
  .handler(async ({ data }): Promise<AiModel[]> => {
    const provider = AiProviderRegistry.get(data.provider);
    return provider.listModels();
  });

// Provider-aware connection test: the currently selected provider + model +
// server-side credential. Returns a normalized result (never secrets) with
// latency and declared capabilities.
export const testAiConnection = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      provider: providerSchema,
      // Optional so the test works while the deployment is still on a
      // provider's built-in default model (nothing saved anywhere yet) —
      // that's exactly when verifying the key matters most.
      model: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AiConnectionResult> => {
    const provider = AiProviderRegistry.get(data.provider);
    const modelId = data.model?.trim() || provider.connectionTestModelId;
    return provider.testConnection(modelId);
  });

export type { AiProviderStatus };

export const getAiProviderStatuses = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async (): Promise<AiProviderStatus[]> => {
    const { apiKeys } = await readAiEnvironment();
    return getProviderStatuses(apiKeys);
  });