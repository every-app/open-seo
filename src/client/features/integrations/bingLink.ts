import * as React from "react";
import { startLinkRedirect } from "@/client/features/integrations/linkRedirect";
import { startBingLink } from "@/serverFunctions/bing";

/**
 * Kick off a delegated Bing Webmaster OAuth grant. Failures during the Bing
 * round-trip redirect back to the same page with an error marker that
 * BingLinkErrorAlert surfaces.
 */
export function startBingLinkFlow(callbackURL: string): Promise<boolean> {
  return startLinkRedirect(startBingLink, callbackURL);
}

/** Restore the picker after Bing's full-page redirect, scoped to this project. */
export function useBingPickerResume(projectId: string) {
  // null lets the card derive unfinished setup from the saved credential.
  // false means the user explicitly closed the picker during this visit.
  const [picking, setPicking] = React.useState<boolean | null>(null);
  const key = `bing-property-picker:${projectId}`;
  React.useEffect(() => {
    setPicking(null);
    try {
      if (sessionStorage.getItem(key)) {
        sessionStorage.removeItem(key);
        setPicking(true);
      }
    } catch {
      /* Storage can be disabled; Connect still opens the picker. */
    }
  }, [key]);

  const linkAccount = async (callbackURL: string) => {
    try {
      sessionStorage.setItem(key, "open");
    } catch {
      /* Bing authorization does not require browser storage. */
    }
    const redirecting = await startBingLinkFlow(callbackURL);
    if (!redirecting) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Storage is optional. */
      }
    }
  };
  return { picking, setPicking, linkAccount };
}
