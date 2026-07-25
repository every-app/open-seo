import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { authClient } from "@/lib/auth-client";
import { BING_OAUTH_PROVIDER_ID } from "@/shared/bing";

/**
 * Kick off the Bing Webmaster OAuth grant. On success this redirects the whole
 * page to Bing's consent screen; `callbackURL` is where Bing returns the user
 * afterward.
 *
 * Unlike the Search Console equivalent there is no self-hosted fallback path
 * yet (see specs/0009): Bing rejects `localhost` redirect URIs and allows one
 * redirect URI per registered client, so a self-hoster cannot complete this
 * flow locally. Callers gate on `bingOAuthConfigured` before offering it.
 */
export async function startBingLink(callbackURL: string): Promise<void> {
  try {
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
