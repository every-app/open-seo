import {
  isSupportedProvider,
  type AiProviderId,
} from "@/server/features/ai/providers";
import { assertValidModelPair } from "@/server/features/ai/AiSettingsService";
import {
  AiSettingsRepository,
  type AiAgentSettingsInput,
} from "@/server/features/ai/AiSettingsRepository";
import {
  decryptCredentialMap,
  encryptCredentialMap,
  resolveCredentialEncryptionKey,
  type CredentialMap,
} from "@/server/features/ai/credentialCrypto";
import { checkBaseUrlForDeployment } from "@/server/features/ai/baseUrl";
import {
  type AiConfigSource,
  type AiCredentialEnvironment,
  type EffectiveAiConfig,
  resolveEffectiveAiConfig,
  maskApiKey,
} from "@/server/features/ai/AiSettingsService";

// Phase S scoped-settings orchestration: save (with encrypted credential
// merge + SSRF-validated Base URLs), scope reset, and the UI-safe view.
// Extracted from AiSettingsService.ts to keep both files within lint budgets.
// resolveEffectiveAiConfig + its types live in AiSettingsService.ts and are
// re-exported here so server functions have one import surface.

export {
  resolveEffectiveAiConfig,
  type AiConfigSource,
  type EffectiveAiConfig,
  type ScopeAiConfig,
  type AiCredentialEnvironment,
  type ResolvedAiSettings,
} from "@/server/features/ai/AiSettingsService";
export { maskApiKey } from "@/server/features/ai/AiSettingsService";
import { getProviderStatuses } from "@/server/features/ai/AiSettingsService";
// ---------------------------------------------------------------------------
// Phase S: scoped save / reset / view orchestration
// ---------------------------------------------------------------------------

export type ScopeName = "organization" | "project";

export type SaveScopePatch = {
  provider?: string;
  model?: string | null;
  /** Endpoint Base URL override: string = set, null = remove, undefined = keep. */
  baseUrl?: string | null;
  /** API key: string = set/replace, null = remove override, undefined = keep. */
  apiKey?: string | null;
  /** Delete the whole scope row - the parent scope becomes effective. */
  resetToInherited?: boolean;
};

export type SaveScopeResult =
  | { ok: true; provider: AiProviderId }
  | { ok: false; error: string };

async function loadScopeRow(
  scope: ScopeName,
  organizationId: string,
  projectId: string | null,
): Promise<{
  provider: string;
  model: string | null;
  baseUrl: string | null;
  credentials: CredentialMap;
} | null> {
  const row =
    scope === "project" && projectId
      ? await AiSettingsRepository.getProjectAiSettingsRow(projectId)
      : await AiSettingsRepository.getOrganizationAiSettingsRow(organizationId);
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    credentials: (await decryptCredentialMap(row.credentialsCiphertext)) ?? {},
  };
}

/**
 * Persist one scope's AI configuration with field-level semantics
 * (undefined = keep, null = clear, value = set) and encrypted credentials.
 * Provider/model pairs are validated; endpoint Base URLs go through the
 * Phase-Q SSRF validator. Never returns or logs plaintext keys.
 */
export async function saveScopeAiSettings(input: {
  scope: ScopeName;
  organizationId: string;
  projectId?: string | null;
  patch: SaveScopePatch;
}): Promise<SaveScopeResult> {
  const { scope, organizationId, projectId, patch } = input;
  const projectIdOrNull = scope === "project" ? (projectId ?? null) : null;

  if (patch.resetToInherited) {
    if (scope === "project" && projectIdOrNull) {
      await AiSettingsRepository.deleteProjectAiSettings(projectIdOrNull);
    } else if (scope === "organization") {
      await AiSettingsRepository.deleteOrganizationAiSettings(organizationId);
    }
    return { ok: true, provider: "openrouter" };
  }

  const existing = await loadScopeRow(scope, organizationId, projectIdOrNull);
  const providerRaw = patch.provider ?? existing?.provider ?? "openrouter";
  if (!isSupportedProvider(providerRaw)) {
    return { ok: false, error: `Unsupported AI provider: ${providerRaw}` };
  }
  const provider = providerRaw;

  const model =
    patch.model === undefined ? (existing?.model ?? null) : patch.model;
  try {
    assertValidModelPair(provider, model);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let baseUrl =
    patch.baseUrl === undefined ? (existing?.baseUrl ?? null) : patch.baseUrl;
  if (baseUrl) {
    const check = await checkBaseUrlForDeployment(baseUrl);
    if (!check.ok) return { ok: false, error: check.reason };
    baseUrl = check.url;
  }

  // Credential merge: undefined keeps the stored key for THIS provider,
  // null removes it, a string sets it. Other providers' entries survive.
  const credentials: CredentialMap = { ...existing?.credentials };
  if (patch.apiKey === null) {
    delete credentials[provider];
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    credentials[provider] = patch.apiKey.trim();
  }

  if (Object.keys(credentials).length > 0) {
    const keyAvailable = await resolveCredentialEncryptionKey();
    if (!keyAvailable) {
      return {
        ok: false,
        error:
          "Credential storage is not configured on this deployment - set AI_CREDENTIALS_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) to save API keys.",
      };
    }
  }
  const ciphertext = await encryptCredentialMap(credentials);

  const rowInput: AiAgentSettingsInput = {
    provider,
    model,
    baseUrl,
    credentialsCiphertext: ciphertext,
  };
  if (scope === "project" && projectIdOrNull) {
    await AiSettingsRepository.upsertProjectAiSettingsRow(
      projectIdOrNull,
      rowInput,
      ciphertext,
    );
  } else {
    await AiSettingsRepository.upsertOrganizationAiSettingsRow(
      organizationId,
      rowInput,
      ciphertext,
    );
  }
  return { ok: true, provider };
}

export type ScopeCredentialStatus = {
  /** True when this scope holds a stored credential for the provider. */
  stored: boolean;
  masked: string | null;
};

export type ScopeAiSettingsView = {
  scope: ScopeName;
  /** This scope's own overrides (null row = fully inheriting). */
  override: {
    provider: string | null;
    model: string | null;
    baseUrl: string | null;
    credentials: Record<string, ScopeCredentialStatus>;
  } | null;
  /** Provider-aware effective configuration (secrets masked). */
  effective: {
    provider: AiProviderId;
    model: string | null;
    baseUrl: string | null;
    providerSource: AiConfigSource;
    baseUrlSource: AiConfigSource;
    credentialSource: AiConfigSource;
    credentialConfigured: boolean;
    credentialMasked: string | null;
  };
  /** Registry statuses (display names, capabilities, env var names). */
  providers: Awaited<ReturnType<typeof getProviderStatuses>>;
};

/**
 * UI-safe view of one scope: overrides, per-provider stored-credential
 * status (masked), and the provider-aware effective configuration.
 * Plaintext keys never leave this function.
 */
export async function getScopeAiSettingsView(input: {
  scope: ScopeName;
  organizationId: string;
  projectId?: string | null;
  env: AiCredentialEnvironment;
}): Promise<ScopeAiSettingsView> {
  const { scope, organizationId, projectId, env } = input;
  const projectIdOrNull = scope === "project" ? (projectId ?? null) : null;
  const row = await loadScopeRow(scope, organizationId, projectIdOrNull);

  const projectRow =
    scope === "project" && projectIdOrNull
      ? await AiSettingsRepository.getProjectAiSettingsRow(projectIdOrNull)
      : null;
  const orgRow =
    await AiSettingsRepository.getOrganizationAiSettingsRow(organizationId);
  const projectCredentials = projectRow
    ? ((await decryptCredentialMap(projectRow.credentialsCiphertext)) ?? {})
    : {};
  const organizationCredentials = orgRow
    ? ((await decryptCredentialMap(orgRow.credentialsCiphertext)) ?? {})
    : {};

  const effective = resolveEffectiveAiConfig({
    project: projectRow
      ? {
          provider: projectRow.provider,
          model: projectRow.model,
          baseUrl: projectRow.baseUrl,
        }
      : null,
    organization: orgRow
      ? {
          provider: orgRow.provider,
          model: orgRow.model,
          baseUrl: orgRow.baseUrl,
        }
      : null,
    projectCredentials,
    organizationCredentials,
    env,
  });

  const maskStored = (map: CredentialMap): Record<string, ScopeCredentialStatus> => {
    const out: Record<string, ScopeCredentialStatus> = {};
    for (const [providerId, key] of Object.entries(map)) {
      out[providerId] = { stored: true, masked: maskApiKey(key) };
    }
    return out;
  };

  return {
    scope,
    override: row
      ? {
          provider: row.provider,
          model: row.model,
          baseUrl: row.baseUrl,
          credentials: maskStored(row.credentials),
        }
      : null,
    effective: {
      provider: effective.provider,
      model: effective.model,
      baseUrl: effective.baseUrl,
      providerSource: effective.providerSource,
      baseUrlSource: effective.baseUrlSource,
      credentialSource: effective.credentialSource,
      credentialConfigured: effective.credential !== null,
      credentialMasked: effective.credential
        ? maskApiKey(effective.credential)
        : null,
    },
    providers: await getProviderStatuses(env.apiKeys),
  };
}

