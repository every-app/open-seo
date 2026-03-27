import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  AuthPageShell,
  authRedirectSearchSchema,
} from "@/client/features/auth/AuthPage";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";

export const Route = createFileRoute("/_auth")({
  validateSearch: authRedirectSearchSchema,
  component: AuthPageLayout,
});

function AuthPageLayout() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const redirectTo = normalizeAuthRedirect(search.redirect);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    void navigate({ href: redirectTo, replace: true });
  }, [navigate, redirectTo, session?.user?.id]);

  if (isHostedMode && (isPending || session?.user?.id)) {
    return null;
  }

  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
