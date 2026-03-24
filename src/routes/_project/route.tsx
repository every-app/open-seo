import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_project")({
  component: ProjectRouteLayout,
});

function ProjectRouteLayout() {
  return <Outlet />;
}
