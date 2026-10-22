import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  identifyAnalyticsUser,
  resetAnalyticsUser,
  startAnalyticsCapture,
  stopAnalyticsCapture,
} from "@/client/lib/posthog";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getActiveOrganizationId } from "@/lib/auth-session";
import {
  PRIVACY_CHOICES_CHANGED_EVENT,
  defaultPrivacyChoices,
  effectivePrivacyChoices,
  hasGlobalPrivacyControl,
  readPrivacyCookie,
  savePrivacyChoices,
  type PrivacyChoices,
} from "@/shared/privacy-choices";

const privacyRegionSchema = z.object({ optIn: z.boolean() });

// The saved choice is a cookie shared with other tabs and openseo.so, so it is
// read fresh on every render instead of cached: a stale copy in one tab would
// write the opposite choice back to the account after a choice in another.
function subscribeToPrivacyCookie(onChange: () => void) {
  window.addEventListener(PRIVACY_CHOICES_CHANGED_EVENT, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(PRIVACY_CHOICES_CHANGED_EVENT, onChange);
    window.removeEventListener("focus", onChange);
  };
}

const readCookies = () => document.cookie;

/** Whether the visitor's location requires opt-in; true if the lookup fails. */
function usePrivacyRegion(enabled: boolean) {
  const region = useQuery({
    queryKey: ["privacy-region"],
    queryFn: async () => {
      const response = await fetch("/api/privacy-region");
      if (!response.ok) throw new Error(`privacy region: ${response.status}`);
      return privacyRegionSchema.parse(await response.json());
    },
    enabled,
    staleTime: Infinity,
  });
  return region.isError ? true : region.data?.optIn;
}

/** Current optional-tracking choices for this browser, or null while the
 *  location-based defaults are still loading. Hosted mode only. */
export function usePrivacyChoices() {
  const isHosted = isHostedClientAuthMode();
  const { data: session } = useSession();
  const cookies = React.useSyncExternalStore(
    subscribeToPrivacyCookie,
    readCookies,
  );
  const saved = React.useMemo(() => readPrivacyCookie(cookies), [cookies]);
  // Choices not saved yet follow the region. That includes the Meta choice in
  // a cookie saved before it existed, since saving analytics writes it too.
  const needsRegion = saved?.advertising === undefined;
  const regionOptIn = usePrivacyRegion(isHosted && needsRegion);

  const optIn = needsRegion ? regionOptIn : false;
  if (!isHosted || optIn === undefined) return null;

  // A browser without a saved choice still honors an analytics opt-out the
  // user made on another device (stored on the account).
  const accountOptedOut = session?.user?.analyticsOptedOut === true;
  const fallback = accountOptedOut
    ? { ...defaultPrivacyChoices(optIn), analytics: false }
    : null;

  return effectivePrivacyChoices({
    saved: saved ?? fallback,
    optIn,
    globalPrivacyControl: hasGlobalPrivacyControl(),
  });
}

/** Saves the browser choice (shared with openseo.so) and mirrors the analytics
 *  choice onto the account so server-side analytics follows it. */
export async function updatePrivacyChoices(
  next: PrivacyChoices,
  signedIn: boolean,
) {
  savePrivacyChoices(next);
  if (!signedIn) return;
  const result = await authClient.updateUser({
    analyticsOptedOut: !next.analytics,
  });
  if (result.error) toast.error("We couldn't save your analytics setting.");
}

/** Starts and stops PostHog to match the current choices. */
export function PrivacyBootstrap() {
  const { data: session, isPending: isSessionPending } = useSession();
  const choices = usePrivacyChoices();
  const userId = session?.user?.id ?? null;
  const accountOptedOut = session?.user?.analyticsOptedOut === true;
  const organizationId = getActiveOrganizationId(session);
  const previousUserIdRef = React.useRef<string | null>(null);

  const analytics = choices?.analytics;
  // Replay records signed-in users only, and only after they agreed to Terms
  // that disclose it: the signup clickwrap or the updated-Terms prompt both
  // record termsAcceptedAt. Older accounts are asked again before recording.
  const replay = session?.user?.termsAcceptedAt != null;
  React.useEffect(() => {
    if (analytics === undefined || isSessionPending) return;

    if (analytics) {
      startAnalyticsCapture({ replay });
      if (userId) {
        identifyAnalyticsUser({ userId, organizationId });
        previousUserIdRef.current = userId;
      }
    } else {
      stopAnalyticsCapture();
    }
    if (!userId && previousUserIdRef.current) {
      previousUserIdRef.current = null;
      resetAnalyticsUser();
    }
  }, [analytics, isSessionPending, organizationId, replay, userId]);

  // Keep the account flag in line with this browser so server-side events
  // stop when analytics is off here (for example, a new EU visitor who hasn't
  // chosen yet).
  React.useEffect(() => {
    if (!userId || analytics === undefined) return;
    if (accountOptedOut === !analytics) return;
    void authClient.updateUser({ analyticsOptedOut: !analytics });
  }, [accountOptedOut, analytics, userId]);

  return null;
}
