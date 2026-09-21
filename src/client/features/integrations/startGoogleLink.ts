import { toast } from "sonner";
import { useSyncExternalStore } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { GOOGLE_LINK_ERROR_PARAM } from "@/client/features/integrations/googleLinkError";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { startSelfHostedGa4Link } from "@/serverFunctions/ga4";
import { startSelfHostedGoogleAdsLink } from "@/serverFunctions/google-ads";
import { startSelfHostedGscLink } from "@/serverFunctions/gsc";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { GOOGLE_ADS_OAUTH_PROVIDER_ID } from "@/shared/google-ads";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

const googleProviders = {
  gsc: {
    providerId: GSC_OAUTH_PROVIDER_ID,
    startSelfHosted: startSelfHostedGscLink,
  },
  ga4: {
    providerId: GA4_OAUTH_PROVIDER_ID,
    startSelfHosted: startSelfHostedGa4Link,
  },
  gads: {
    providerId: GOOGLE_ADS_OAUTH_PROVIDER_ID,
    startSelfHosted: startSelfHostedGoogleAdsLink,
  },
} as const;

function withGoogleLinkErrorParam(
  callbackURL: string,
  provider: "gsc" | "ga4" | "gads",
): string {
  const url = new URL(callbackURL, window.location.origin);
  url.searchParams.set(GOOGLE_LINK_ERROR_PARAM, provider);
  return url.toString();
}

// One link flow at a time: a double-click, or a second Connect click while the
// redirect to Google is pending, would overwrite the single Better Auth state
// cookie and guarantee a state_mismatch for whichever consent screen finishes.
let linkRedirectPending = false;
const listeners = new Set<() => void>();

function setLinkPending(pending: boolean) {
  linkRedirectPending = pending;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** All Google entry points share the same request and navigation state. */
export function useGoogleLinkPending() {
  return useSyncExternalStore(
    subscribe,
    () => linkRedirectPending,
    () => false,
  );
}

/**
 * Kick off an incremental Google OAuth grant. On success this redirects the
 * whole page to Google's consent screen; `callbackURL` is where Google returns
 * the user afterward. Failures during the Google round-trip redirect to the
 * same page with an error marker that GoogleLinkErrorAlert surfaces. Shared by
 * the connection cards, onboarding, property pickers, and re-engagement prompt
 * so the link/error/redirect flow stays in one place — callers keep their own
 * analytics and dismissal behavior.
 */
export async function startGoogleLink(
  provider: "gsc" | "ga4" | "gads",
  callbackURL: string,
): Promise<boolean> {
  if (linkRedirectPending) return false;
  setLinkPending(true);
  let redirecting = false;
  try {
    const config = googleProviders[provider];
    let url: string | undefined;
    if (!isHostedClientAuthMode()) {
      const res = await config.startSelfHosted({ data: { callbackURL } });
      url = res.url;
    } else {
      const res = await authClient.oauth2.link({
        providerId: config.providerId,
        callbackURL,
        errorCallbackURL: withGoogleLinkErrorParam(callbackURL, provider),
      });
      if (res.error) {
        toast.error(res.error.message ?? "Could not start Google sign-in");
        return false;
      }
      url = res.data?.url;
    }
    if (!url) return false;

    redirecting = true;
    window.location.href = url;
    // The page is about to unload, so the guard normally never needs to
    // release — but the browser can cancel a pending navigation (Esc, a
    // beforeunload prompt). Revive the buttons instead of leaving the page
    // dead until reload.
    setTimeout(() => {
      setLinkPending(false);
    }, 15_000);
    return true;
  } catch (error) {
    toast.error(getStandardErrorMessage(error));
    return false;
  } finally {
    // Single release point: any exit that didn't hand off to the browser
    // (error, missing URL, thrown) re-arms the button immediately.
    if (!redirecting) setLinkPending(false);
  }
}
