import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AuthPageShell,
  authRedirectSearchSchema,
} from "@/client/features/auth/AuthPage";
import { useSession } from "@/lib/auth-client";
import { PageLoading } from "@/client/components/Spinner";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getCurrentAuthRedirect, isDocumentRoute } from "@/lib/auth-redirect";

export const Route = createFileRoute("/_auth")({
  validateSearch: authRedirectSearchSchema,
  component: AuthPageLayout,
});

function AuthPageLayout() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [hasResolvedSession, setHasResolvedSession] = useState(false);
  const isHostedMode = isHostedClientAuthMode();
  const redirectTo = getCurrentAuthRedirect(search.redirect);

  useEffect(() => {
    if (!isPending) setHasResolvedSession(true);
  }, [isPending]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    // Already authenticated: hand off to the destination. If the user is
    // unverified, that route's useHostedAuthRouteGuard bounces them to
    // /verify-email — this layout doesn't duplicate that rule.
    //
    // A document route (a report at /r/<id>) has no client component, so an SPA
    // navigation there would render an empty shell; ask for a real page load.
    void navigate({
      href: redirectTo,
      replace: true,
      reloadDocument: isDocumentRoute(redirectTo),
    });
  }, [navigate, redirectTo, session?.user?.id]);

  // Loading the session, or handing a signed-in user off to the destination.
  if (
    isHostedMode &&
    ((isPending && !hasResolvedSession) || session?.user?.id)
  ) {
    return <PageLoading />;
  }

  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
