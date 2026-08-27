import { AiProviderRegistry } from "@/server/features/ai/providers";
import {
  resolveEffectiveAiConfig,
  type EffectiveAiConfig,
  type AiCredentialEnvironment,
} from "@/server/features/ai/AiSettingsService";
import { decryptCredentialMap } from "@/server/features/ai/credentialCrypto";
import { AiSettingsRepository } from "@/server/features/ai/AiSettingsRepository";
import { getEnvValueSync } from "@/server/lib/runtime-env";

// Assemble SAM's per-turn effective AI configuration (Phase S): the stored
// project/organization rows (with encrypted credentials) plus the deployment
// env, resolved provider-aware into one {provider, model, baseUrl, credential}
// bundle. Extracted from SamChatAgent to keep the DO file within lint budgets.

/** Read one env var through the DO's env record (sync; Think's hook is sync). */
function readEnv(env: object, key: string): string | null {
  return getEnvValueSync(env, key) ?? null;
}

/**
 * Resolve the effective {provider, model, baseUrl, credential} for SAM turns.
 * Never throws for missing config — callers decide hard-failure vs.
 * getModel() fallback (turn.model stays unset when no model is configured).
 */
export async function resolveSamEffectiveConfig(input: {
  env: object;
  projectId: string;
  organizationId: string;
}): Promise<EffectiveAiConfig> {
  const { env, projectId, organizationId } = input;
  const [projectRow, organizationRow] = await Promise.all([
    AiSettingsRepository.getProjectAiSettingsRow(projectId),
    AiSettingsRepository.getOrganizationAiSettingsRow(organizationId),
  ]);
  return resolveEffectiveAiConfig({
    project: projectRow
      ? {
          provider: projectRow.provider,
          model: projectRow.model,
          baseUrl: projectRow.baseUrl,
        }
      : null,
    organization: organizationRow
      ? {
          provider: organizationRow.provider,
          model: organizationRow.model,
          baseUrl: organizationRow.baseUrl,
        }
      : null,
    projectCredentials: projectRow
      ? ((await decryptCredentialMap(projectRow.credentialsCiphertext)) ?? {})
      : {},
    organizationCredentials: organizationRow
      ? ((await decryptCredentialMap(
          organizationRow.credentialsCiphertext,
        )) ?? {})
      : {},
    env: buildCredentialEnv(env),
  });
}

/** Collect the AI-relevant deployment env values through the DO env record. */
export function buildCredentialEnv(env: object): AiCredentialEnvironment {
  return {
    aiAgentProvider: readEnv(env, "AI_AGENT_PROVIDER"),
    aiAgentModel: readEnv(env, "AI_AGENT_MODEL"),
    providerModelDefaults: {
      openrouter: readEnv(env, "OPENROUTER_MODEL"),
      openai: readEnv(env, "OPENAI_MODEL"),
      gemini: readEnv(env, "GEMINI_MODEL"),
      anthropic: readEnv(env, "ANTHROPIC_MODEL"),
      openai_compatible: readEnv(env, "OPENAI_COMPATIBLE_MODEL"),
      ollama_cloud: readEnv(env, "OLLAMA_CLOUD_MODEL"),
    },
    apiKeys: {
      openrouter: readEnv(env, "OPENROUTER_API_KEY"),
      openai: readEnv(env, "OPENAI_API_KEY"),
      gemini: readEnv(env, "GEMINI_API_KEY"),
      anthropic: readEnv(env, "ANTHROPIC_API_KEY"),
      openai_compatible: readEnv(env, "OPENAI_COMPATIBLE_API_KEY"),
      ollama_cloud: readEnv(env, "OLLAMA_API_KEY"),
    },
    baseUrls: {
      openai_compatible: readEnv(env, "OPENAI_COMPATIBLE_BASE_URL"),
      ollama_cloud: readEnv(env, "OLLAMA_CLOUD_BASE_URL"),
    },
  };
}

export { AiProviderRegistry };