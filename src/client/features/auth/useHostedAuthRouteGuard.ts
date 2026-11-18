import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
  usesBetterAuthClient,
} from "@/lib/auth-mode";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
  getVerifyEmailSearch,
} from "@/lib/auth-redirect";

export function useHostedAuthRouteGuard() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  // The session guard runs wherever Better Auth accounts exist (hosted and the
  // standalone Docker edition); isHostedMode is kept for callers that gate
  // hosted-only surfaces such as billing.
  const isHostedMode = isHostedClientAuthMode();
  const hasAccounts = usesBetterAuthClient();
  const emailVerified =
    session?.user?.emailVerified === true || isEmailVerificationBypassed();

  useEffect(() => {
    if (isPending || !hasAccounts) {
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

    if (!emailVerified) {
      void navigate({
        to: "/verify-email",
        search: getVerifyEmailSearch(session.user.email, redirectTo),
        replace: true,
      });
    }
  }, [
    isPending,
    hasAccounts,
    emailVerified,
    session?.user?.email,
    session?.user?.id,
    navigate,
  ]);

  const hasVerifiedSession =
    !isPending && Boolean(session?.user?.id) && emailVerified;

  return {
    isHostedMode,
    canRenderAuthenticatedContent: !hasAccounts || hasVerifiedSession,
  };
}
