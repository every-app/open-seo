import {
  AiProviderRegistry,
  type AiModel,
  type AiProvider,
  type AiProviderCapabilities,
  type AiProviderId,
  isSupportedProvider,
  validateModelForProvider,
} from "@/server/features/ai/providers";
import {
  AiSettingsRepository,
  type AiAgentSettingsInput,
} from "@/server/features/ai/AiSettingsRepository";

// Effective AI settings for the in-app agent, resolved from the most specific
// configured scope down to the environment default:
//
//   project row > organization row > AI_AGENT_PROVIDER/AI_AGENT_MODEL >
//   provider default (OPENROUTER_MODEL/OPENAI_MODEL/...) > built-in default
//
// The built-in default lives in the provider adapters (defaultModelId); this
// service only decides which provider/model has been chosen and guards against
// provider/model mismatches, so the agent and the settings UI share one
// resolution path.

export type ResolvedAiSettings = {
  provider: AiProviderId;
  /** Null = fall back to environment/default. */
  model: string | null;
};

export type AiModelEnvironment = {
  aiAgentProvider: string | null;
  aiAgentModel: string | null;
  /** Per-provider model defaults from env (OPENROUTER_MODEL, OPENAI_MODEL, …). */
  providerModelDefaults: Partial<Record<AiProviderId, string | null>>;
};

export type AiProviderStatus = {
  id: AiProviderId;
  displayName: string;
  capabilities: AiProviderCapabilities;
  envApiKey: string;
  configured: boolean;
  maskedApiKey: string | null;
};

/**
 * Provider/model pair with a runtime safety net: a model that can't belong to
 * the provider (checked against the provider's id pattern; the catalog is
 * authoritative when provided) is dropped to null rather than sent to the
 * wrong API. The pair is only kept when it passes validation.
 */
function safePair(
  provider: AiProviderId,
  model: string | null,
  catalog: AiModel[] = [],
): ResolvedAiSettings {
  if (!model) return { provider, model: null };
  const invalid = validateModelForProvider(provider, model, catalog);
  if (invalid) {
    return { provider, model: null };
  }
  return { provider, model };
}

export function resolveAiSettings(
  settings: {
    project: AiAgentSettingsInput | null;
    organization: AiAgentSettingsInput | null;
  },
  env: AiModelEnvironment,
): ResolvedAiSettings {
  const scopeOrder = [
    settings.project?.provider && settings.project?.model
      ? { provider: settings.project.provider, model: settings.project.model }
      : null,
    settings.organization?.provider && settings.organization?.model
      ? {
          provider: settings.organization.provider,
          model: settings.organization.model,
        }
      : null,
  ];
  const fromSettings = scopeOrder.find((entry) => entry !== null) ?? null;
  if (fromSettings) {
    return safePair(
      isSupportedProvider(fromSettings.provider)
        ? fromSettings.provider
        : "openrouter",
      fromSettings.model,
    );
  }
  const envProvider = AiProviderRegistry.getEnvDefaultProviderId(
    env.aiAgentProvider,
  );
  const envModel =
    env.aiAgentModel ??
    env.providerModelDefaults[envProvider] ??
    null;
  return safePair(envProvider, envModel);
}

// Legacy name kept for callers that haven't migrated (pre-O2 signature).
export function resolveAiModel(
  settings: {
    project: AiAgentSettingsInput | null;
    organization: AiAgentSettingsInput | null;
  },
  env: { aiAgentModel: string | null; openRouterModel: string | null },
): ResolvedAiSettings {
  return resolveAiSettings(settings, {
    aiAgentProvider: null,
    aiAgentModel: env.aiAgentModel,
    providerModelDefaults: { openrouter: env.openRouterModel },
  });
}

export function maskApiKey(key: string): string {
  if (!key) return "••••••••";
  if (key.length <= 8) return "••••••••";
  // sk-or-v1-xxxxxxxx...xxxx — keep the scheme prefix and the last 4 chars,
  // never anything in between.
  const schemeEnd = Math.min(key.indexOf("-") + 1, 8);
  return `${key.slice(0, schemeEnd)}••••${key.slice(-4)}`;
}

function providerStatus(
  provider: AiProvider,
  apiKey: string | null,
): AiProviderStatus {
  return {
    id: provider.id,
    displayName: provider.displayName,
    capabilities: provider.capabilities,
    envApiKey: provider.envApiKey,
    configured: Boolean(apiKey),
    maskedApiKey: apiKey ? maskApiKey(apiKey) : null,
  };
}

/**
 * Per-provider credential status for the settings UI. Keys are only ever
 * masked or absent — never returned in plaintext.
 */
export async function getProviderStatuses(
  apiKeys: Partial<Record<AiProviderId, string | null>>,
): Promise<AiProviderStatus[]> {
  return AiProviderRegistry.list().map((provider) =>
    providerStatus(provider, apiKeys[provider.id] ?? null),
  );
}

export async function getAiSettingsOverview(input: {
  organizationId: string;
  projectId: string | null;
  env: AiModelEnvironment;
  apiKeys: Partial<Record<AiProviderId, string | null>>;
}): Promise<{
  organization: AiAgentSettingsInput | null;
  project: AiAgentSettingsInput | null;
  effective: ResolvedAiSettings;
  providers: AiProviderStatus[];
  /** True when the *effective* provider's key is configured. */
  apiKeyConfigured: boolean;
  maskedApiKey: string | null;
}> {
  const organization = await AiSettingsRepository.getOrganizationAiSettings(
    input.organizationId,
  );
  const project = input.projectId
    ? await AiSettingsRepository.getProjectAiSettings(input.projectId)
    : null;
  const effective = resolveAiSettings({ project, organization }, input.env);
  const effectiveKey = input.apiKeys[effective.provider] ?? null;
  return {
    organization,
    project,
    effective,
    providers: await getProviderStatuses(input.apiKeys),
    apiKeyConfigured: Boolean(effectiveKey),
    maskedApiKey: effectiveKey ? maskApiKey(effectiveKey) : null,
  };
}

/**
 * Save-path validation: a provider/model pair that fails the provider's id
 * pattern is rejected outright (the catalog may be unavailable, so the
 * pattern is the hard guard; the connection test then verifies the pair
 * against the live API).
 */
export function assertValidModelPair(
  provider: string,
  model: string | null,
): void {
  if (!isSupportedProvider(provider)) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  if (!model) return;
  const invalid = validateModelForProvider(provider, model, []);
  if (invalid) throw new Error(invalid);
}

export async function updateOrganizationAiSettings(
  organizationId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  assertValidModelPair(input.provider, input.model);
  await AiSettingsRepository.upsertOrganizationAiSettings(organizationId, input);
}

export async function updateProjectAiSettings(
  projectId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  assertValidModelPair(input.provider, input.model);
  await AiSettingsRepository.upsertProjectAiSettings(projectId, input);
}