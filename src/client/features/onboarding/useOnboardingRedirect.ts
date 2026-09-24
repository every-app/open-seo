import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { onboardingAnswersQueryOptions } from "@/client/features/onboarding/onboardingModel";
import { useSession } from "@/lib/auth-client";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";

export function useOnboardingRedirect() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const isEmailVerified =
    session?.user?.emailVerified === true || isEmailVerificationBypassed();
  const enabled = isHostedMode && Boolean(session?.user?.id) && isEmailVerified;
  const onboardingQuery = useQuery({
    ...onboardingAnswersQueryOptions(),
    enabled,
    retry: false,
  });

  useEffect(() => {
    if (
      !isHostedMode ||
      !session?.user?.id ||
      !isEmailVerified ||
      !onboardingQuery.data ||
      onboardingQuery.isError ||
      onboardingQuery.data?.completedAt ||
      window.location.pathname === "/onboarding"
    ) {
      return;
    }

    void navigate({ to: "/onboarding", search: { step: 0 }, replace: true });
  }, [
    isHostedMode,
    navigate,
    onboardingQuery.data?.completedAt,
    onboardingQuery.data,
    onboardingQuery.isError,
    onboardingQuery.isLoading,
    isEmailVerified,
    session?.user?.id,
  ]);

  // Do not mount a second redirect (the project route) while deciding whether
  // this user must finish onboarding. Errors go through the shared recovery UI.
  if (enabled && onboardingQuery.error) throw onboardingQuery.error;
  return enabled && !onboardingQuery.data?.completedAt;
}
