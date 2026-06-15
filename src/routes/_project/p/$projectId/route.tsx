import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { setLastProjectId } from "@/client/lib/active-project";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { FreePlanBanner } from "@/client/features/billing/FreePlanBanner";
import { useSubscribeRedirect } from "@/client/features/billing/useSubscribeRedirect";
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
  const subscribeGate = useSubscribeRedirect();

  // Remember this as the last-visited project for the landing redirect.
  // Settings is excluded: editing another project's settings is
  // administration, not a context switch, so it shouldn't change which
  // project the app opens next time.
  const isSettingsPage = useLocation({
    select: (l) => l.pathname.endsWith("/settings"),
  });
  useEffect(() => {
    if (isSettingsPage) return;
    setLastProjectId(projectId);
  }, [projectId, isSettingsPage]);

  if (!authGate.canRenderAuthenticatedContent || subscribeGate.isBlocking) {
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
