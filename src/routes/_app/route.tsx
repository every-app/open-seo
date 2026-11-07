import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { prefetchBillingAccount } from "@/client/features/billing/billingAccountQuery";
import { FreePlanBanner } from "@/client/features/billing/FreePlanBanner";
import { TermsUpdateBanner } from "@/client/features/auth/TermsUpdateBanner";
import { PageLoading } from "@/client/components/Spinner";
import { getLastProjectId } from "@/client/lib/active-project";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";

export const Route = createFileRoute("/_app")({
  component: AppRouteLayout,
});

// One layout for app pages and project pages (/p/$projectId/...), so the
// drawer, setup modal and GSC nudge keep their state when the user moves
// between the two.
function AppRouteLayout() {
  const authGate = useHostedAuthRouteGuard();
  const isOnboarded = useOnboardingRedirect();
  const { projectId } = useParams({ strict: false });
  // The page and banners render while the session check runs, so a page shows
  // its own skeleton from the first frame and loads its data alongside the
  // check. The check only redirects (signed out, unverified email): every
  // data call enforces auth on the server.
  const ready = authGate.canRenderAuthenticatedContent;

  // Billing, fix-payment, and the upgrade page all read this one cached
  // account, so loading it once here lets them open without waiting. The free
  // plan banner reads it too; starting it with the page's own data keeps the
  // banner from landing after the page and pushing it down.
  useEffect(() => {
    prefetchBillingAccount();
  }, []);

  // Until onboarding is known to be done, show a plain spinner, so a user on
  // their way to /onboarding never sees the dashboard flash first. A browser
  // that has opened a project is past onboarding, so the shell paints at once.
  if (!isOnboarded && !getLastProjectId()) {
    return <PageLoading />;
  }

  return (
    <AuthenticatedAppLayout
      projectId={projectId}
      ready={ready}
      banner={
        authGate.isHostedMode ? (
          <>
            <TermsUpdateBanner />
            {projectId ? <FreePlanBanner /> : null}
          </>
        ) : undefined
      }
    >
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
