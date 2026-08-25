import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const CHAT_MODEL_MISSING_MESSAGE =
  "No chat model is configured yet. Set OPENROUTER_API_KEY (OpenRouter), or CHAT_BASE_URL for a local / OpenAI-compatible model (vLLM, Ollama), then restart OpenSEO and confirm here.";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the in-app AI agent (SAM) on a chat model being configured, the same
// way backlinks/AI-search gate on their DataForSEO subscriptions. A model is
// available when either an OpenRouter key or a local endpoint (CHAT_BASE_URL)
// is set. Hosted deployments always have OpenRouter provisioned, so only
// self-hosted is checked.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    const [apiKey, baseURL] = await Promise.all([
      getOptionalEnvValue("OPENROUTER_API_KEY"),
      getOptionalEnvValue("CHAT_BASE_URL"),
    ]);
    const enabled = Boolean(apiKey || baseURL);
    return {
      enabled,
      errorMessage: enabled ? null : CHAT_MODEL_MISSING_MESSAGE,
    };
  });
