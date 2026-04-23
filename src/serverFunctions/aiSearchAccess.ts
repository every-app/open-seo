import { createServerFn } from "@tanstack/react-start";
import {
  fetchDataforseoAccountState,
  hasActiveDataforseoSubscription,
} from "@/server/lib/dataforseoAccountState";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { aiSearchProjectSchema } from "@/types/schemas/ai-search";

const AI_SEARCH_NOT_ENABLED_MESSAGE =
  "AI Optimization is not enabled for the connected DataForSEO account yet. Turn it on in DataForSEO, then confirm here.";

type AiSearchAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

export const getAiSearchAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => aiSearchProjectSchema.parse(data))
  .handler(async (): Promise<AiSearchAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    const state = await fetchDataforseoAccountState();
    const enabled = hasActiveDataforseoSubscription(
      state?.llmMentionsSubscriptionExpiryDate ?? null,
    );
    return {
      enabled,
      errorMessage: enabled ? null : AI_SEARCH_NOT_ENABLED_MESSAGE,
    };
  });
