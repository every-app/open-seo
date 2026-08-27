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
  /** Per-provider model defaults from env (OPENROUTER_MODEL, OPENAI_MODEL, ...). */
  providerModelDefaults: Partial<Record<AiProviderId, string | null>>;
};

export type AiProviderStatus = {
  id: AiProviderId;
  displayName: string;
  capabilities: AiProviderCapabilities;
  envApiKey: string;
  /** Deployment-readiness per the adapter (key and/or required Base URL). */
  configured: boolean;
  maskedApiKey: string | null;
  /**
   * Deployment-configured endpoint Base URL for adapters that take one
   * (OpenAI-Compatible / Ollama Cloud). Configuration data, not a secret.
   */
  baseUrl: string | null;
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

// ---------------------------------------------------------------------------
// Phase S: provider-aware effective configuration (provider/model/baseUrl/
// credential) with field-level inheritance across project -> organization ->
// environment. THE core invariant: a field from one scope is only used when
// it belongs to the EFFECTIVE provider - a Gemini project never inherits an
// OpenAI credential, and an org key for provider X never serves provider Y.
// ---------------------------------------------------------------------------

export type AiConfigSource =
  | "project"
  | "organization"
  | "environment"
  | "none";

export type ScopeAiConfig = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
};

export type EffectiveAiConfig = {
  provider: AiProviderId;
  model: string | null;
  /** Endpoint override; only set when it belongs to the effective provider. */
  baseUrl: string | null;
  baseUrlSource: AiConfigSource;
  /** Plaintext credential for the effective provider (server-side only). */
  credential: string | null;
  credentialSource: AiConfigSource;
  /** Which scope supplied the provider choice. */
  providerSource: AiConfigSource;
};

export type AiCredentialEnvironment = {
  aiAgentProvider: string | null;
  aiAgentModel: string | null;
  providerModelDefaults: Partial<Record<AiProviderId, string | null>>;
  /** Per-provider env credentials (OPENROUTER_API_KEY, ...). */
  apiKeys: Partial<Record<AiProviderId, string | null>>;
  /** Env endpoint Base URLs (OPENAI_COMPATIBLE_BASE_URL, OLLAMA_CLOUD_BASE_URL). */
  baseUrls: Partial<Record<AiProviderId, string | null>>;
};

function firstProviderMatch(
  effective: AiProviderId,
  scopes: Array<{
    source: AiConfigSource;
    row: ScopeAiConfig | null;
    value: string | null | undefined;
  }>,
): { value: string; source: AiConfigSource } | null {
  for (const scope of scopes) {
    if (!scope.row || !scope.value) continue;
    // Provider-awareness: the field is only usable when its row's provider
    // matches the effective provider (S2/S6).
    if (
      isSupportedProvider(scope.row.provider) &&
      scope.row.provider === effective
    ) {
      return { value: scope.value, source: scope.source };
    }
  }
  return null;
}

/**
 * Resolve the full effective configuration. Credentials arrive pre-decrypted
 * (service caller decrypts via credentialCrypto); this function only applies
 * the provider-aware precedence:
 *
 *   provider : project -> organization -> AI_AGENT_PROVIDER -> "openrouter"
 *   model    : same-scope-as-provider model -> env model for provider -> adapter
 *              default (null here; the adapter owns the built-in default)
 *   baseUrl  : project -> organization (same provider) -> env per-provider -> null
 *   key      : project -> organization (same provider) -> env per-provider -> null
 */
export function resolveEffectiveAiConfig(input: {
  project: ScopeAiConfig | null;
  organization: ScopeAiConfig | null;
  projectCredentials: Record<string, string> | null;
  organizationCredentials: Record<string, string> | null;
  env: AiCredentialEnvironment;
}): EffectiveAiConfig {
  const { project, organization, env } = input;

  const providerChoice =
    (project?.provider
      ? { source: "project" as AiConfigSource, provider: project.provider }
      : null) ??
    (organization?.provider
      ? {
          source: "organization" as AiConfigSource,
          provider: organization.provider,
        }
      : null) ?? {
      source: "environment" as AiConfigSource,
      provider: AiProviderRegistry.getEnvDefaultProviderId(
        env.aiAgentProvider,
      ),
    };
  const provider: AiProviderId = isSupportedProvider(providerChoice.provider)
    ? providerChoice.provider
    : "openrouter";

  // Model: prefer the model stored alongside the winning provider choice,
  // then any same-provider scope, then env defaults for this provider.
  const modelFromScopes = firstProviderMatch(provider, [
    { source: "project", row: project, value: project?.model },
    { source: "organization", row: organization, value: organization?.model },
  ]);
  const envModel =
    (providerChoice.source === "environment" ? env.aiAgentModel : null) ??
    env.providerModelDefaults[provider] ??
    null;
  const model = modelFromScopes?.value ?? envModel ?? null;

  const baseUrlFromScopes = firstProviderMatch(provider, [
    { source: "project", row: project, value: project?.baseUrl },
    {
      source: "organization",
      row: organization,
      value: organization?.baseUrl,
    },
  ]);
  const envBaseUrl = env.baseUrls[provider] ?? null;

  const credentialFromScopes = (
    [
      {
        source: "project" as AiConfigSource,
        map: input.projectCredentials,
      },
      {
        source: "organization" as AiConfigSource,
        map: input.organizationCredentials,
      },
    ] as const
  ).find((scope) => scope.map?.[provider] !== undefined) ?? null;
  const envCredential = env.apiKeys[provider] ?? null;
  const scopedCredential =
    (credentialFromScopes?.map ?? {})[provider] ?? null;

  return {
    provider,
    model: safePair(provider, model).model,
    baseUrl: baseUrlFromScopes?.value ?? envBaseUrl,
    baseUrlSource: baseUrlFromScopes?.source ?? (envBaseUrl ? "environment" : "none"),
    credential: scopedCredential ?? envCredential ?? null,
    credentialSource:
      credentialFromScopes?.source ?? (envCredential ? "environment" : "none"),
    providerSource: providerChoice.source,
  };
}

export function maskApiKey(key: string): string {
  const mask = "\u2022\u2022\u2022\u2022";
  if (!key) return mask.repeat(2);
  if (key.length <= 8) return mask.repeat(2);
  // sk-or-v1-xxxxxxxx...xxxx - keep the scheme prefix and the last 4 chars,
  // never anything in between.
  const schemeEnd = Math.min(key.indexOf("-") + 1, 8);
  return `${key.slice(0, schemeEnd)}${mask}${key.slice(-4)}`;
}

async function providerStatus(
  provider: AiProvider,
  apiKey: string | null,
): Promise<AiProviderStatus> {
  return {
    id: provider.id,
    displayName: provider.displayName,
    capabilities: provider.capabilities,
    envApiKey: provider.envApiKey,
    configured: await provider.isConfigured(),
    maskedApiKey: apiKey ? maskApiKey(apiKey) : null,
    baseUrl: (await provider.baseUrl?.()) ?? null,
  };
}

/**
 * Per-provider credential status for the settings UI. Keys are only ever
 * masked or absent - never returned in plaintext.
 */
export async function getProviderStatuses(
  apiKeys: Partial<Record<AiProviderId, string | null>>,
): Promise<AiProviderStatus[]> {
  return Promise.all(
    AiProviderRegistry.list().map((provider) =>
      providerStatus(provider, apiKeys[provider.id] ?? null),
    ),
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
