import { AiModelSettingsRepository } from "@/server/features/ai-search/repositories/AiModelSettingsRepository";
import {
  PROMPT_EXPLORER_MODEL_DEFAULTS,
  PROMPT_EXPLORER_MODELS,
  type PromptExplorerModelVersions,
} from "@/types/schemas/ai-search";

/**
 * Per-project default model versions for AI visibility checks. Prompt Explorer
 * resolves each provider as: per-run choice → project setting → app default.
 */
export const AiModelSettingsService = {
  getSettings(projectId: string): Promise<PromptExplorerModelVersions> {
    return AiModelSettingsRepository.list(projectId);
  },

  updateSettings(
    projectId: string,
    versions: PromptExplorerModelVersions,
  ): Promise<void> {
    // A choice equal to the app default is stored as "no choice" so the
    // project keeps tracking app-level model bumps for that provider.
    const stored: Record<string, string> = {};
    for (const provider of PROMPT_EXPLORER_MODELS) {
      const version = versions[provider];
      if (version && version !== PROMPT_EXPLORER_MODEL_DEFAULTS[provider]) {
        stored[provider] = version;
      }
    }
    return AiModelSettingsRepository.replace(
      projectId,
      stored as PromptExplorerModelVersions,
    );
  },
};
