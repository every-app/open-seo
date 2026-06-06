import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/seo-audit")({
  component: SeoAuditLayout,
});

function SeoAuditLayout() {
  return <Outlet />;
}
