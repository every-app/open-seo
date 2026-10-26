import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
} from "@tanstack/react-router";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { usesBetterAuthClient } from "@/lib/auth-mode";
import { PageLoading } from "@/client/components/Spinner";
import { Button } from "@/client/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedShellLayout,
});

function AuthenticatedShellLayout() {
  const authGate = useHostedAuthRouteGuard();
  const { pathname } = useLocation();

  // Every page under this layout is hosted-only, except the MCP OAuth consent:
  // password self-hosts sign MCP clients in with the same accounts.
  const isMcpConsent = pathname === "/oauth-consent" && usesBetterAuthClient();
  if (!authGate.isHostedMode && !isMcpConsent) {
    return (
      <AuthPageShell>
        <AuthPageCard
          title="Not available"
          helperText="This page isn't available right now."
        >
          <Button
            nativeButton={false}
            render={<Link to="/" />}
            variant="secondary"
            className="w-full"
          >
            Back to OpenSEO
          </Button>
        </AuthPageCard>
      </AuthPageShell>
    );
  }

  if (!authGate.canRenderAuthenticatedContent) {
    return <PageLoading />;
  }

  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
