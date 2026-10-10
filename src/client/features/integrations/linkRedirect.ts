import { toast } from "sonner";
import { useSyncExternalStore } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/** Starts an incremental OAuth grant and returns the consent URL. */
type StartLink = (input: {
  data: { callbackURL: string };
}) => Promise<{ url: string }>;

// One link flow at a time across every provider: a double-click, or a Connect
// click while a redirect to another provider is still pending, would start two
// consent screens competing for one return page.
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

/** All provider entry points share the same request and navigation state. */
export function useLinkRedirectPending() {
  return useSyncExternalStore(
    subscribe,
    () => linkRedirectPending,
    () => false,
  );
}

/**
 * Kick off an incremental OAuth grant. On success this redirects the whole
 * page to the provider's consent screen; `callbackURL` is where the provider
 * returns the user afterward. Failures building the authorization URL surface
 * as a toast; failures during the provider round-trip redirect back to the
 * same page with an error marker that the matching LinkErrorAlert surfaces.
 */
export async function startLinkRedirect(
  start: StartLink,
  callbackURL: string,
): Promise<boolean> {
  if (linkRedirectPending) return false;
  setLinkPending(true);
  let redirecting = false;
  try {
    const { url } = await start({ data: { callbackURL } });
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
