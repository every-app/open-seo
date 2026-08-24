import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CHAT_AGENT_KEY_MISSING_MESSAGE } from "@/server/lib/chatAgentModel";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the in-app AI agent (SAM) on an LLM key being configured — OpenRouter
// or an OpenAI-compatible gateway — the same way backlinks/AI-search gate on
// their DataForSEO subscriptions. Hosted deployments always have a key
// provisioned, so only self-hosted is checked.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    const [openRouterKey, gatewayKey] = await Promise.all([
      getOptionalEnvValue("OPENROUTER_API_KEY"),
      getOptionalEnvValue("LLM_API_KEY"),
    ]);
    const enabled = Boolean(openRouterKey ?? gatewayKey);
    return {
      enabled,
      errorMessage: enabled ? null : CHAT_AGENT_KEY_MISSING_MESSAGE,
    };
  });
