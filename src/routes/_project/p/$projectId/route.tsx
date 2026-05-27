import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { FreePlanBanner } from "@/client/features/billing/FreePlanBanner";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";
import { getErrorCode } from "@/client/lib/error-messages";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
} from "@/lib/auth-redirect";
import { getProjectAccess } from "@/serverFunctions/projects";

export const Route = createFileRoute("/_project/p/$projectId")({
  beforeLoad: async ({ location, params }) => {
    try {
      await getProjectAccess({ data: { projectId: params.projectId } });
    } catch (error) {
      if (getErrorCode(error) === "UNAUTHENTICATED") {
        throw redirect({
          to: "/sign-in",
          search: getSignInSearch(
            getCurrentAuthRedirectFromHref(location.href),
          ),
          replace: true,
        });
      }

      throw redirect({ to: "/", replace: true });
    }
  },
  pendingComponent: ProjectRoutePending,
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const authGate = useHostedAuthRouteGuard();
  useOnboardingRedirect();

  if (!authGate.canRenderAuthenticatedContent) {
    return null;
  }

  return (
    <AuthenticatedAppLayout
      projectId={projectId}
      banner={authGate.isHostedMode ? <FreePlanBanner /> : undefined}
    >
      <Outlet />
    </AuthenticatedAppLayout>
  );
}

function ProjectRoutePending() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="loading loading-spinner loading-md" />
    </div>
  );
}
