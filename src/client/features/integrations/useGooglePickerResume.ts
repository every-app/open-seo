import { useEffect, useState } from "react";
import {
  startGoogleLink,
  useGoogleLinkPending,
} from "@/client/features/integrations/startGoogleLink";
import type { GoogleLinkProvider } from "@/shared/google-link";

const pickerKey = (provider: GoogleLinkProvider, projectId: string) =>
  `google-property-picker:${provider}:${projectId}`;

/** True on the page Google returns to, until useGooglePickerResume reopens the picker. */
export function googlePickerPending(
  provider: GoogleLinkProvider,
  projectId: string,
) {
  try {
    return sessionStorage.getItem(pickerKey(provider, projectId)) !== null;
  } catch {
    return false;
  }
}

/** Restore the picker after Google's full-page redirect, scoped to this project. */
export function useGooglePickerResume(
  provider: GoogleLinkProvider,
  projectId: string,
) {
  // null lets the card derive unfinished setup from the saved authorization.
  // false means the user explicitly closed the picker during this visit.
  const [picking, setPicking] = useState<boolean | null>(null);
  const linking = useGoogleLinkPending();
  const key = pickerKey(provider, projectId);
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
