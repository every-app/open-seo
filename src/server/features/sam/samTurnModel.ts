import type { EffectiveAiConfig } from "@/server/features/ai/AiSettingsService";
import {
  AiProviderRegistry,
  toolCallingRefusalFor,
} from "@/server/features/ai/providers";

// Per-turn model construction for SamChatAgent, extracted to keep the DO
// file within lint budgets. The effective provider is authoritative (no
// automatic fallback to another provider): a missing credential/endpoint is
// a hard, visible failure — except key-optional endpoint adapters with a
// usable Base URL.

export type SamTurnModelResult =
  | { kind: "refusal"; message: string }
  | { kind: "model"; model: ReturnType<ReturnType<typeof AiProviderRegistry.get>["buildModel"]> }
  | { kind: "env-default" };

/**
 * Resolve the turn's model from the effective config: a tool-less catalog
 * entry refuses the turn; a configured provider without a usable credential
 * throws (hard failure — visible, never a silent fallback); otherwise the
 * built LanguageModel is returned. `env-default` means TurnConfig omits the
 * model and Think resolves getModel().
 */
export async function buildSamTurnModel(
  effective: EffectiveAiConfig,
): Promise<SamTurnModelResult> {
  if (!effective.model) return { kind: "env-default" };
  const provider = AiProviderRegistry.get(effective.provider);
  // Warm lazily-resolved adapter config (env Base URLs) before the
  // synchronous model build below.
  await provider.prepare?.();
  // SAM is a tool-using agent: refuse models the catalog explicitly marks as
  // tool-less (unknown capability passes — unverifiable).
  const refusal = await toolCallingRefusalFor(provider, effective.model);
  if (refusal) return { kind: "refusal", message: refusal };
  const ready =
    effective.credential !== null ||
    (provider.credentialOptional === true &&
      (effective.baseUrl ?? (await provider.baseUrl?.())) != null);
  if (!ready) {
    throw new Error(
      `AI provider "${effective.provider}" is selected for this project, but no usable credential is configured for it (stored at project/organization scope or via ${provider.envApiKey}).`,
    );
  }
  return {
    kind: "model",
    model: provider.buildModel(effective.credential ?? "", effective.model, {
      baseUrl: effective.baseUrl ?? undefined,
    }),
  };
}
