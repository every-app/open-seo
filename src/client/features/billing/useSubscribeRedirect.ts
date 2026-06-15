import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { managedAccessQueryOptions } from "@/client/features/billing/managed-access";
import { onboardingAnswersQueryOptions } from "@/client/features/onboarding/onboardingModel";
import { useSession } from "@/lib/auth-client";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

// Account-management pages stay reachable without a subscription so gated
// users can change settings, read docs, or contact support (no dead ends).
const GATE_EXEMPT_PATH_PREFIXES = ["/settings", "/support", "/help"];

// Sends hosted users without managed access (no plan in Autumn) to the
// subscribe paywall. Runs only after onboarding completes so the onboarding
// redirect always wins first, and fails open on query errors — billing being
// down must not lock paying users out (spend is gated server-side anyway).
export function useSubscribeRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const isEmailVerified =
    session?.user?.emailVerified === true || isEmailVerificationBypassed();
  const isEligible =
    isHostedMode && Boolean(session?.user?.id) && isEmailVerified;

  const onboardingQuery = useQuery({
    ...onboardingAnswersQueryOptions(),
    enabled: isEligible,
  });
  const hasCompletedOnboarding = Boolean(onboardingQuery.data?.completedAt);

  const accessQuery = useQuery({
    ...managedAccessQueryOptions(),
    enabled: isEligible && hasCompletedOnboarding,
  });

  const isExemptPath = GATE_EXEMPT_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const shouldRedirect =
    isEligible &&
    hasCompletedOnboarding &&
    accessQuery.data?.hasManagedAccess === false &&
    !isExemptPath;

  useEffect(() => {
    if (!shouldRedirect) return;
    void navigate({
      to: SUBSCRIBE_ROUTE,
      search: { redirect: pathname },
      replace: true,
    });
  }, [navigate, pathname, shouldRedirect]);

  // Hold rendering until we know whether the user may see the app, and while
  // a redirect is imminent. This avoids flashing gated pages (which would
  // fire their data queries and create default projects for users who never
  // pass the paywall).
  const isBlocking =
    isEligible &&
    hasCompletedOnboarding &&
    (accessQuery.isLoading || shouldRedirect);

  return { isBlocking };
}
