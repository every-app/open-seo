import { createServerFn } from "@tanstack/react-start";
import {
  fetchDataforseoAccountState,
  hasActiveDataforseoSubscription,
} from "@/server/lib/dataforseoAccountState";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { backlinksProjectSchema } from "@/types/schemas/backlinks";

const BACKLINKS_NOT_ENABLED_MESSAGE =
  "Backlinks is not enabled for the connected DataForSEO account yet. Turn it on in DataForSEO, then confirm here.";

type BacklinksAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

export const getBacklinksAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(backlinksProjectSchema)
  .handler(async (): Promise<BacklinksAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    const state = await fetchDataforseoAccountState();
    const enabled = hasActiveDataforseoSubscription(
      state?.backlinksSubscriptionExpiryDate ?? null,
    );
    return {
      enabled,
      errorMessage: enabled ? null : BACKLINKS_NOT_ENABLED_MESSAGE,
    };
  });
