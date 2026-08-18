import {
  AiSettingsRepository,
  type AiAgentSettingsInput,
} from "@/server/features/ai/AiSettingsRepository";
import { AiProviderRegistry } from "@/server/features/ai/providers";

// Effective AI settings for the in-app agent, resolved from the most specific
// configured scope down to the environment default:
//
//   project row > organization row > AI_AGENT_MODEL > OPENROUTER_MODEL > built-in
//
// The built-in default lives in src/server/lib/openrouter.ts; this service only
// decides whether a model id has been chosen and what env fallbacks exist, so
// the agent and the settings UI share one resolution path.

export type ResolvedAiSettings = {
  provider: string;
  /** Null = fall back to environment/default. */
  model: string | null;
};

type AiModelEnvironment = {
  aiAgentModel: string | null;
  openRouterModel: string | null;
};

export function resolveAiModel(
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
    return { provider: fromSettings.provider, model: fromSettings.model };
  }
  const envModel = env.aiAgentModel ?? env.openRouterModel;
  return { provider: "openrouter", model: envModel };
}

export function maskApiKey(key: string): string {
  if (!key) return "••••••••";
  if (key.length <= 8) return "••••••••";
  // Sk-or-v1-xxxxxxxx...xxxx — keep the scheme prefix and the last 4 chars,
  // never anything in between.
  const schemeEnd = Math.min(key.indexOf("-") + 1, 8);
  return `${key.slice(0, schemeEnd)}••••${key.slice(-4)}`;
}

export async function getAiSettingsOverview(input: {
  organizationId: string;
  projectId: string | null;
  env: AiModelEnvironment;
  apiKey: string | null;
}): Promise<{
  organization: AiAgentSettingsInput | null;
  project: AiAgentSettingsInput | null;
  effective: ResolvedAiSettings;
  apiKeyConfigured: boolean;
  maskedApiKey: string | null;
}> {
  const organization = await AiSettingsRepository.getOrganizationAiSettings(
    input.organizationId,
  );
  const project = input.projectId
    ? await AiSettingsRepository.getProjectAiSettings(input.projectId)
    : null;
  const effective = resolveAiModel({ project, organization }, input.env);
  return {
    organization,
    project,
    effective,
    apiKeyConfigured: Boolean(input.apiKey),
    maskedApiKey: input.apiKey ? maskApiKey(input.apiKey) : null,
  };
}

export async function updateOrganizationAiSettings(
  organizationId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  assertSupportedProvider(input.provider);
  await AiSettingsRepository.upsertOrganizationAiSettings(organizationId, input);
}

export async function updateProjectAiSettings(
  projectId: string,
  input: AiAgentSettingsInput,
): Promise<void> {
  assertSupportedProvider(input.provider);
  await AiSettingsRepository.upsertProjectAiSettings(projectId, input);
}

function assertSupportedProvider(provider: string): void {
  if (!AiProviderRegistry.list().some((entry) => entry.id === provider)) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}