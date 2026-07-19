import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

type ProviderEnv = {
  AUTH_MODE?: string;
  AI_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  AIPASS_API_KEY?: string;
  AIPASS_MODEL?: string;
};

type ChatAgentProviderConfig =
  | { provider: "openrouter"; apiKey: string; modelId?: string }
  | { provider: "aipass"; apiKey: string; modelId: string };

const DEFAULT_CHAT_AGENT_MODEL = "minimax/minimax-m3";
const AIPASS_BASE_URL = "https://aipass.one/apikey/v1";

export function getChatAgentSetupStatus(env: ProviderEnv): {
  enabled: boolean;
  errorMessage: string | null;
} {
  try {
    getChatAgentProviderConfig(env);
    return { enabled: true, errorMessage: null };
  } catch (error) {
    return {
      enabled: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getChatAgentProviderConfig(
  env: ProviderEnv,
): ChatAgentProviderConfig {
  // Hosted billing relies on OpenRouter's providerMetadata usage cost. AI Pass
  // is intentionally self-hosted-only until hosted user-funded billing is wired.
  const provider =
    env.AUTH_MODE?.trim() === "hosted"
      ? "openrouter"
      : env.AI_PROVIDER?.trim() || "openrouter";
  if (provider === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter",
      );
    }
    return {
      provider,
      apiKey,
      modelId: env.OPENROUTER_MODEL?.trim() || undefined,
    };
  }
  if (provider === "aipass") {
    const apiKey = env.AIPASS_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("AIPASS_API_KEY is required when AI_PROVIDER=aipass");
    }
    const modelId = env.AIPASS_MODEL?.trim();
    if (!modelId) {
      throw new Error("AIPASS_MODEL is required when AI_PROVIDER=aipass");
    }
    return { provider, apiKey, modelId };
  }
  throw new Error('AI_PROVIDER must be either "openrouter" or "aipass"');
}

export function buildChatAgentModel(
  config: ChatAgentProviderConfig,
): LanguageModelV3 {
  if (config.provider === "aipass") {
    return createOpenRouter({
      apiKey: config.apiKey,
      baseURL: AIPASS_BASE_URL,
      compatibility: "compatible",
    })(config.modelId);
  }

  return createOpenRouter({ apiKey: config.apiKey })(
    config.modelId ?? DEFAULT_CHAT_AGENT_MODEL,
    {
      usage: { include: true },
      reasoning: { effort: "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    },
  );
}

export async function getChatAgentProviderConfigFromEnv(): Promise<ChatAgentProviderConfig> {
  const [
    AUTH_MODE,
    AI_PROVIDER,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    AIPASS_API_KEY,
    AIPASS_MODEL,
  ] = await Promise.all(
    [
      "AUTH_MODE",
      "AI_PROVIDER",
      "OPENROUTER_API_KEY",
      "OPENROUTER_MODEL",
      "AIPASS_API_KEY",
      "AIPASS_MODEL",
    ].map(getOptionalEnvValue),
  );
  return getChatAgentProviderConfig({
    AUTH_MODE,
    AI_PROVIDER,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    AIPASS_API_KEY,
    AIPASS_MODEL,
  });
}
