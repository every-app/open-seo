import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { startSelfHostedGa4Link } from "@/serverFunctions/ga4";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";

/**
 * Kick off the incremental Google Analytics (GA4) OAuth grant. On success this
 * redirects the whole page to Google's consent screen; `callbackURL` is where
 * Google returns the user afterward. Independent of the Search Console grant —
 * connecting one never requires re-consenting the other.
 */
export async function startGa4Link(callbackURL: string): Promise<void> {
  try {
    if (!isHostedClientAuthMode()) {
      const res = await startSelfHostedGa4Link({ data: { callbackURL } });
      window.location.href = res.url;
      return;
    }

    const res = await authClient.oauth2.link({
      providerId: GA4_OAUTH_PROVIDER_ID,
      callbackURL,
    });
    if (res.error) {
      toast.error(res.error.message ?? "Could not start Google sign-in");
      return;
    }
    if (res.data?.url) {
      window.location.href = res.data.url;
    }
  } catch (error) {
    toast.error(getStandardErrorMessage(error));
  }
}
