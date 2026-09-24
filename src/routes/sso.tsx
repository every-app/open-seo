import { createFileRoute } from "@tanstack/react-router";
import { DgtlSsoRedirect } from "@/client/features/auth/DgtlSsoRedirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

// Intentionally outside _auth and _app: their existing-session redirects
// would skip the central identity check when switching accounts in the hub.
export const Route = createFileRoute("/sso")({
  component: ServiceHubEntry,
});

export function ServiceHubEntry() {
  if (
    !isHostedClientAuthMode() ||
    import.meta.env.VITE_DGTL_SSO_ENABLED !== "true"
  ) {
    return <main>DGTL single sign-on is not configured.</main>;
  }

  // Always sign in, never link to the previous local session. The OAuth
  // callback replaces the session before root chooses onboarding/projects.
  return <DgtlSsoRedirect redirectTo="/" signedOut={false} />;
}
