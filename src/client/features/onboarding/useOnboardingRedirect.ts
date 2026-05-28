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

    void navigate({ to: "/onboarding", search: { step: 0 }, replace: true });
  }, [
    isHostedMode,
    navigate,
    onboardingQuery.data?.completedAt,
    onboardingQuery.isError,
    onboardingQuery.isLoading,
    isEmailVerified,
    session?.user?.id,
  ]);
}
