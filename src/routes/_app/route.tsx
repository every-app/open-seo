import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";

export const Route = createFileRoute("/_app")({
  component: AppRouteLayout,
});

function AppRouteLayout() {
  return (
    <AuthenticatedAppLayout>
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
