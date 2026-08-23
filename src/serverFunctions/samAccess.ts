import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const CHAT_KEY_MISSING_MESSAGE =
  "No chat provider API key is set for this deployment yet. Add one to your environment, restart OpenSEO, then confirm here.";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the in-app AI agent (SAM) on an OpenRouter key being configured, the
// same way backlinks/AI-search gate on their DataForSEO subscriptions. Hosted
// deployments always have the key provisioned, so only self-hosted is checked.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    const [routedKey, minimaxKey] = await Promise.all([
      getOptionalEnvValue("OPENROUTER_API_KEY"),
      getOptionalEnvValue("MINIMAX_API_KEY"),
    ]);
    const enabled = Boolean(routedKey || minimaxKey);
    return {
      enabled,
      errorMessage: enabled ? null : CHAT_KEY_MISSING_MESSAGE,
    };
  });
