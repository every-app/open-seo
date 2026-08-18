import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  AiProviderRegistry,
  isSupportedProvider,
} from "@/server/features/ai/providers";
import {
  getAiSettingsOverview,
  updateOrganizationAiSettings,
  updateProjectAiSettings as saveProjectAiSettings,
  type ResolvedAiSettings,
} from "@/server/features/ai/AiSettingsService";

const settingsSchema = z.object({
  provider: z.string().refine(isSupportedProvider),
  model: z.string().max(120).optional(),
});

// Global (organization) AI settings: provider + default model. Credentials are
// never stored or returned â€” the masked key status is derived from the
// server-side deployment secret.
export const getGlobalAiSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }): Promise<{
    organization: { provider: string; model: string | null } | null;
    effective: ResolvedAiSettings;
    apiKeyConfigured: boolean;
    maskedApiKey: string | null;
  }> => {
const envModel = (await getOptionalEnvValue("AI_AGENT_MODEL")) ?? null;
    const openRouterModel = (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? null;
    const apiKey = (await getOptionalEnvValue("OPENROUTER_API_KEY")) ?? null;
    const overview = await getAiSettingsOverview({
      organizationId: context.organizationId,
      projectId: null,
      env: { aiAgentModel: envModel, openRouterModel },
      apiKey,
    });
    return {
      organization: overview.organization,
      effective: overview.effective,
      apiKeyConfigured: overview.apiKeyConfigured,
      maskedApiKey: overview.maskedApiKey,
    };
  });

export const updateGlobalAiSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(settingsSchema)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
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
  .handler(async ({ context }): Promise<{
    project: { provider: string; model: string | null } | null;
    effective: ResolvedAiSettings;
  }> => {
const envModel = (await getOptionalEnvValue("AI_AGENT_MODEL")) ?? null;
    const openRouterModel = (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? null;
    const overview = await getAiSettingsOverview({
      organizationId: context.organizationId,
      projectId: context.projectId,
      env: { aiAgentModel: envModel, openRouterModel },
      apiKey: null,
    });
    return { project: overview.project, effective: overview.effective };
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
    await saveProjectAiSettings(context.projectId, {
      provider: data.provider,
      model: data.model?.trim() ? data.model.trim() : null,
    });
    return { ok: true };
  });

// Model catalog for the settings UI. Cached server-side (see providers.ts);
// returns the full list and lets the client filter.
export const listAiModels = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    const provider = AiProviderRegistry.get("openrouter");
    return provider.listModels();
  });

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ provider: z.string(), model: z.string().min(1) }))
  .handler(async ({ data }) => {
    const provider = AiProviderRegistry.get(data.provider);
    return provider.testConnection(data.model);
  });
