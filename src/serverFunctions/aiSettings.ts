import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  AiProviderRegistry,
  SUPPORTED_PROVIDERS,
  isSupportedProvider,
  type AiModel,
  type AiConnectionResult,
} from "@/server/features/ai/providers";
import {
  getScopeAiSettingsView,
  saveScopeAiSettings,
  type SaveScopePatch,
  type ScopeAiSettingsView,
  type ScopeName,
  type AiCredentialEnvironment,
} from "@/server/features/ai/scopedSettings";
import {
  AiSettingsRepository,
} from "@/server/features/ai/AiSettingsRepository";
import {
  decryptCredentialMap,
} from "@/server/features/ai/credentialCrypto";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";

/**
 * Project authorization for scope fns that receive an explicit projectId:
 * the project must belong to the caller's organization (same ADR-0001 rule
 * the ensure-user middleware applies to project-scoped server functions).
 */
async function assertProjectAccess(
  projectId: string,
  organizationId: string,
): Promise<void> {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN", "Project not found in this organization.");
  }
}

const providerSchema = z.enum(SUPPORTED_PROVIDERS);

// The env values every settings read needs: deployment provider/model
// overrides, per-provider keys/models/Base URLs. Keys stay server-side â€” only
// masked presence ever reaches the client.
async function readAiCredentialEnvironment(): Promise<{
  env: AiCredentialEnvironment;
}> {
  const env: AiCredentialEnvironment = {
    aiAgentProvider: (await getOptionalEnvValue("AI_AGENT_PROVIDER")) ?? null,
    aiAgentModel: (await getOptionalEnvValue("AI_AGENT_MODEL")) ?? null,
    providerModelDefaults: {
      openrouter: (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? null,
      openai: (await getOptionalEnvValue("OPENAI_MODEL")) ?? null,
      gemini: (await getOptionalEnvValue("GEMINI_MODEL")) ?? null,
      anthropic: (await getOptionalEnvValue("ANTHROPIC_MODEL")) ?? null,
      openai_compatible:
        (await getOptionalEnvValue("OPENAI_COMPATIBLE_MODEL")) ?? null,
      ollama_cloud: (await getOptionalEnvValue("OLLAMA_CLOUD_MODEL")) ?? null,
    },
    apiKeys: {
      openrouter: (await getOptionalEnvValue("OPENROUTER_API_KEY")) ?? null,
      openai: (await getOptionalEnvValue("OPENAI_API_KEY")) ?? null,
      gemini: (await getOptionalEnvValue("GEMINI_API_KEY")) ?? null,
      anthropic: (await getOptionalEnvValue("ANTHROPIC_API_KEY")) ?? null,
      openai_compatible:
        (await getOptionalEnvValue("OPENAI_COMPATIBLE_API_KEY")) ?? null,
      ollama_cloud: (await getOptionalEnvValue("OLLAMA_API_KEY")) ?? null,
    },
    baseUrls: {
      openai_compatible:
        (await getOptionalEnvValue("OPENAI_COMPATIBLE_BASE_URL")) ?? null,
      ollama_cloud:
        (await getOptionalEnvValue("OLLAMA_CLOUD_BASE_URL")) ?? null,
    },
  };
  return { env };
}

/**
 * Decrypt the stored credential maps for one organization (project optional)
 * and resolve the provider-aware EFFECTIVE configuration for `provider`:
 * stored project key â†’ stored organization key â†’ env key â€” never crossing
 * providers. Also resolves the effective Base URL for endpoint providers.
 */
async function resolveProviderEffective(input: {
  provider: string;
  organizationId: string;
  projectId?: string | null;
}) {
  const { env } = await readAiCredentialEnvironment();
  const orgRow = await AiSettingsRepository.getOrganizationAiSettingsRow(
    input.organizationId,
  );
  const projectRow = input.projectId
    ? await AiSettingsRepository.getProjectAiSettingsRow(input.projectId)
    : null;
  const projectCredentials: Record<string, string> = projectRow
    ? ((await decryptCredentialMap(projectRow.credentialsCiphertext)) ?? {})
    : {};
  const organizationCredentials: Record<string, string> = orgRow
    ? ((await decryptCredentialMap(orgRow.credentialsCiphertext)) ?? {})
    : {};
  const providerId = isSupportedProvider(input.provider)
    ? input.provider
    : null;
  const effective = {
    credential:
      projectCredentials[input.provider] ??
      organizationCredentials[input.provider] ??
      (providerId ? (env.apiKeys[providerId] ?? null) : null),
    baseUrl:
      (projectRow?.provider === input.provider
        ? projectRow?.baseUrl
        : null) ??
      (orgRow?.provider === input.provider ? orgRow?.baseUrl : null) ??
      (providerId ? (env.baseUrls[providerId] ?? null) : null),
  };
  return effective;
}

// ---------------------------------------------------------------------------
// Scope views (S8/S9/S13): overrides + inheritance labels + effective config
// ---------------------------------------------------------------------------

export const getScopeAiSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      scope: z.enum(["organization", "project"]),
      projectId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<ScopeAiSettingsView> => {
    if (data.scope === "project") {
      if (!data.projectId) {
        throw new Error("projectId is required for project scope");
      }
      // Project scope requires project authorization (ADR-0001 rule).
      await assertProjectAccess(data.projectId, context.organizationId);
    }
    const { env } = await readAiCredentialEnvironment();
    return getScopeAiSettingsView({
      scope: data.scope,
      organizationId: context.organizationId,
      projectId: data.projectId ?? null,
      env,
    });
  });

// ---------------------------------------------------------------------------
// Scope save / reset (S7/S22/S23)
// ---------------------------------------------------------------------------

const savePatchSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().max(120).nullable().optional(),
  baseUrl: z.string().max(500).nullable().optional(),
  apiKey: z.string().max(400).nullable().optional(),
  resetToInherited: z.boolean().optional(),
});

export const saveScopeAiSettingsFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      scope: z.enum(["organization", "project"]),
      projectId: z.string().min(1).optional(),
      patch: savePatchSchema,
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; provider: string }> => {
    if (data.scope === "project") {
      if (!data.projectId) {
        throw new Error("projectId is required for project scope");
      }
      // Project scope requires project authorization (ADR-0001 rule).
      await assertProjectAccess(data.projectId, context.organizationId);
    }
    const result = await saveScopeAiSettings({
      scope: data.scope,
      organizationId: context.organizationId,
      projectId: data.projectId ?? null,
      patch: data.patch,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { ok: true, provider: result.provider };
  });

export type { SaveScopePatch };

// ---------------------------------------------------------------------------
// Model catalog (S14-S18): effective-config aware + cache-bypassing refresh
// ---------------------------------------------------------------------------

export const listAiModels = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      provider: providerSchema,
      /** Endpoint Base URL override (unsaved edit) for endpoint providers. */
      baseUrl: z.string().max(400).optional(),
      /** Unsaved API key for discovery â€” round-trips over TLS, never stored/logged. */
      apiKey: z.string().max(400).optional(),
      /** Refresh Models: bypass the catalog cache (S16). */
      refresh: z.boolean().optional(),
      /** Resolve stored credentials at project scope when no key is passed. */
      projectId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<AiModel[]> => {
    let apiKey = data.apiKey;
    let baseUrl = data.baseUrl;
    if (!apiKey || (!baseUrl && data.provider !== "openrouter")) {
      const effective = await resolveProviderEffective({
        provider: data.provider,
        organizationId: context.organizationId,
        projectId: data.projectId ?? null,
      });
      apiKey = apiKey ?? effective.credential ?? undefined;
      baseUrl = baseUrl ?? effective.baseUrl ?? undefined;
    }
    const provider = AiProviderRegistry.get(data.provider);
    return provider.listModels({
      apiKey: apiKey ?? undefined,
      baseUrl: baseUrl ?? undefined,
      refresh: data.refresh,
    });
  });

// ---------------------------------------------------------------------------
// Connection test (S21): always effective config, plus unsaved-edit support
// ---------------------------------------------------------------------------

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      provider: providerSchema,
      model: z.string().max(120).optional(),
      baseUrl: z.string().max(400).optional(),
      apiKey: z.string().max(400).optional(),
      projectId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<AiConnectionResult> => {
    const provider = AiProviderRegistry.get(data.provider);
    const modelId = data.model?.trim() || provider.connectionTestModelId;
    // Effective credential/Base URL when the client didn't pass unsaved edits:
    // stored project key â†’ stored organization key â†’ env key (same provider).
    let baseUrl = data.baseUrl;
    let apiKey = data.apiKey;
    if (!apiKey) {
      const effective = await resolveProviderEffective({
        provider: data.provider,
        organizationId: context.organizationId,
        projectId: data.projectId ?? null,
      });
      apiKey = effective.credential ?? undefined;
      baseUrl = baseUrl ?? effective.baseUrl ?? undefined;
    }
    return provider.testConnection(modelId, {
      baseUrl: baseUrl ?? undefined,
      apiKey: apiKey ?? undefined,
    });
  });

export type { ScopeAiSettingsView, ScopeName };