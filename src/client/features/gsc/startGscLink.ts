import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { startSelfHostedGscLink } from "@/serverFunctions/gsc";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

/**
 * Kick off the incremental Google Search Console OAuth grant. On success this
 * redirects the whole page to Google's consent screen; `callbackURL` is where
 * Google returns the user afterward. Shared by the connect card, the onboarding
 * step, and the re-engagement nudge so the link/error/redirect flow stays in
 * one place — callers keep their own analytics/dismissal at the call site.
 */
export async function startGscLink(callbackURL: string): Promise<void> {
  try {
    if (!isHostedClientAuthMode()) {
      const res = await startSelfHostedGscLink({ data: { callbackURL } });
      window.location.href = res.url;
      return;
    }

    const res = await authClient.oauth2.link({
      providerId: GSC_OAUTH_PROVIDER_ID,
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
