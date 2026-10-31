import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
} from "@tanstack/react-router";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { PageLoading } from "@/client/components/Spinner";
import { Button } from "@/client/components/ui/button";
import { usesBetterAuthClient } from "@/lib/auth-mode";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedShellLayout,
});

function AuthenticatedShellLayout() {
  const authGate = useHostedAuthRouteGuard();
  const isOAuthConsent = Boolean(
    useMatch({ from: "/_authenticated/oauth-consent", shouldThrow: false }),
  );

  // MCP consent works wherever the app has its own accounts (hosted and
  // password self-hosts); every other page under this layout is hosted-only.
  const isAvailable = isOAuthConsent
    ? usesBetterAuthClient()
    : authGate.isHostedMode;
  if (!isAvailable) {
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
