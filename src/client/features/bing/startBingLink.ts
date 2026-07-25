import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { startSelfHostedBingLink } from "@/serverFunctions/bing";
import { BING_OAUTH_PROVIDER_ID } from "@/shared/bing";

/**
 * Kick off the Bing Webmaster OAuth grant. On success this redirects the whole
 * page to Bing's consent screen; `callbackURL` is where Bing returns the user
 * afterward.
 *
 * Self-hosted deployments (`cloudflare_access` / `local_noauth`) take the
 * hand-rolled path, because Better Auth's `oauth2.link` needs a Better Auth
 * session they do not have. Note Bing rejects `localhost` redirect URIs and
 * allows one per registered client, so a self-hoster needs their own client
 * registered against this deployment's public origin — a dev server on
 * localhost cannot complete the flow at all.
 */
export async function startBingLink(callbackURL: string): Promise<void> {
  try {
    if (!isHostedClientAuthMode()) {
      const res = await startSelfHostedBingLink({ data: { callbackURL } });
      window.location.href = res.url;
      return;
    }

    const res = await authClient.oauth2.link({
      providerId: BING_OAUTH_PROVIDER_ID,
      callbackURL,
    });
    if (res.error) {
      toast.error(res.error.message ?? "Could not start Bing sign-in");
      return;
    }
    if (res.data?.url) {
      window.location.href = res.data.url;
    }
  } catch (error) {
    toast.error(getStandardErrorMessage(error));
  }
}
