import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/audit")({
  component: SiteAuditLayout,
});

function SiteAuditLayout() {
  return <Outlet />;
}
