import { toast } from "sonner";
import { useSyncExternalStore } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { startGa4Link } from "@/serverFunctions/ga4";
import { startGoogleAdsLink } from "@/serverFunctions/google-ads";
import { startGscLink } from "@/serverFunctions/gsc";
import type { GoogleLinkProvider } from "@/shared/google-link";

const startLink: Record<GoogleLinkProvider, typeof startGscLink> = {
  gsc: startGscLink,
  ga4: startGa4Link,
  gads: startGoogleAdsLink,
};

// One link flow at a time: a double-click, or a second Connect click while the
// redirect to Google is pending, would start two consent screens for one
// return page.
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
 * the user afterward. Failures during the Google round-trip redirect back to
 * the same page with an error marker that GoogleLinkErrorAlert surfaces.
 * Shared by the connection cards, onboarding, property pickers, and
 * re-engagement prompt so the link/error/redirect flow stays in one place —
 * callers keep their own analytics and dismissal behavior.
 */
export async function startGoogleLink(
  provider: GoogleLinkProvider,
  callbackURL: string,
): Promise<boolean> {
  if (linkRedirectPending) return false;
  setLinkPending(true);
  let redirecting = false;
  try {
    const { url } = await startLink[provider]({ data: { callbackURL } });
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
    // (a thrown request) re-arms the button immediately.
    if (!redirecting) setLinkPending(false);
  }
}
