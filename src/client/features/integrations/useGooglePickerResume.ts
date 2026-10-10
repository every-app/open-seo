import { useEffect, useState } from "react";
import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";
import { useLinkRedirectPending } from "@/client/features/integrations/linkRedirect";

/** Restore the picker after Google's full-page redirect, scoped to this project. */
export function useGooglePickerResume(
  provider: "gsc" | "ga4",
  projectId: string,
) {
  // null lets the card derive unfinished setup from the saved authorization.
  // false means the user explicitly closed the picker during this visit.
  const [picking, setPicking] = useState<boolean | null>(null);
  const linking = useLinkRedirectPending();
  const key = `google-property-picker:${provider}:${projectId}`;
  useEffect(() => {
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
      /* Google authorization does not require browser storage. */
    }
    const redirecting = await startGoogleLink(provider, callbackURL);
    if (!redirecting) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Storage is optional. */
      }
    }
  };
  return { picking, setPicking, linkAccount, linking };
}
