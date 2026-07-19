import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { getChatAgentSetupStatus } from "@/server/lib/chatAgentModel";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the in-app AI agent (SAM) on the selected provider being configured, the
// same way backlinks/AI-search gate on their DataForSEO subscriptions. Hosted
// deployments always keep their provisioned OpenRouter key and shared credit
// metering, so only self-hosted provider configuration is checked here.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    const authMode = await getOptionalEnvValue("AUTH_MODE");
    const provider = await getOptionalEnvValue("AI_PROVIDER");
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    return getChatAgentSetupStatus({
      AUTH_MODE: authMode,
      AI_PROVIDER: provider,
      OPENROUTER_API_KEY: await getOptionalEnvValue("OPENROUTER_API_KEY"),
      OPENROUTER_MODEL: await getOptionalEnvValue("OPENROUTER_MODEL"),
      AIPASS_API_KEY: await getOptionalEnvValue("AIPASS_API_KEY"),
      AIPASS_MODEL: await getOptionalEnvValue("AIPASS_MODEL"),
    });
  });
