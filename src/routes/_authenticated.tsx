import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthPageShell } from "@/client/features/auth/AuthPage";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedShellLayout,
});

function AuthenticatedShellLayout() {
  const authGate = useHostedAuthRouteGuard();

  if (!authGate.isHostedMode || !authGate.canRenderAuthenticatedContent) {
    return null;
  }

  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
