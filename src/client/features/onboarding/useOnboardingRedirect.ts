import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { onboardingAnswersQueryOptions } from "@/client/features/onboarding/onboardingModel";
import { useSession } from "@/lib/auth-client";
import { getCurrentAuthRedirectFromHref } from "@/lib/auth-redirect";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";

// Returns whether the app can render: true once onboarding is known to be
// finished, or its check failed (the app is the safer fallback).
export function useOnboardingRedirect() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const isEmailVerified =
    session?.user?.emailVerified === true || isEmailVerificationBypassed();
  const onboardingQuery = useQuery({
    ...onboardingAnswersQueryOptions(),
    enabled: isHostedMode && Boolean(session?.user?.id) && isEmailVerified,
  });

  useEffect(() => {
    if (
      !isHostedMode ||
      !session?.user?.id ||
      !isEmailVerified ||
      onboardingQuery.isLoading ||
      onboardingQuery.isError ||
      onboardingQuery.data?.completedAt ||
      window.location.pathname === "/onboarding"
    ) {
      return;
    }

    // Remember the page the user asked for, so a deep link (a project page,
    // say) still lands there after onboarding.
    const redirect = getCurrentAuthRedirectFromHref(window.location.href);
    void navigate({
      to: "/onboarding",
      search: { step: 0, redirect: redirect === "/" ? undefined : redirect },
      replace: true,
    });
  }, [
    isHostedMode,
    navigate,
    onboardingQuery.data?.completedAt,
    onboardingQuery.isError,
    onboardingQuery.isLoading,
    isEmailVerified,
    session?.user?.id,
  ]);

  return (
    !isHostedMode ||
    onboardingQuery.isError ||
    Boolean(onboardingQuery.data?.completedAt)
  );
}
