import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
  getVerifyEmailSearch,
} from "@/lib/auth-redirect";

export function useHostedAuthRouteGuard() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();

  useEffect(() => {
    if (isPending || !isHostedMode) {
      return;
    }

    const redirectTo = getCurrentAuthRedirectFromHref(window.location.href);

    if (!session?.user?.id) {
      void navigate({
        to: "/sign-in",
        search: getSignInSearch(redirectTo),
        replace: true,
      });
      return;
    }

    if (!session.user.emailVerified) {
      void navigate({
        to: "/verify-email",
        search: getVerifyEmailSearch(session.user.email, redirectTo),
        replace: true,
      });
    }
  }, [
    isPending,
    isHostedMode,
    session?.user?.email,
    session?.user?.emailVerified,
    session?.user?.id,
    navigate,
  ]);

  const hasVerifiedHostedSession =
    !isPending &&
    Boolean(session?.user?.id) &&
    session?.user?.emailVerified === true;

  return {
    isHostedMode,
    canRenderAuthenticatedContent: !isHostedMode || hasVerifiedHostedSession,
  };
}
