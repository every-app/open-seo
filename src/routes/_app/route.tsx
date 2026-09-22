import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { isLocalDemoAuthEnabled, useDemoSession } from "@/client/features/auth/demoAuth";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/_app")({
  component: AppRouteLayout,
});

function AppRouteLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === "/";
  const isHostedMode = isHostedClientAuthMode();
  const isDemoMode = isLocalDemoAuthEnabled();
  const authGate = useHostedAuthRouteGuard(!isLanding);
  const demoSession = useDemoSession(isDemoMode && !isLanding);
  useOnboardingRedirect();

  useEffect(() => {
    if (
      isHostedMode ||
      !isDemoMode ||
      isLanding ||
      demoSession.isPending ||
      demoSession.data?.authenticated
    ) return;
    void navigate({ to: "/sign-in", replace: true });
  }, [demoSession.data?.authenticated, demoSession.isPending, isDemoMode, isHostedMode, isLanding, navigate]);

  if (isLanding) return <Outlet />;

  if (
    !authGate.canRenderAuthenticatedContent ||
    (isDemoMode &&
      (demoSession.isPending || !demoSession.data?.authenticated))
  ) {
    return null;
  }

  return (
    <AuthenticatedAppLayout>
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
