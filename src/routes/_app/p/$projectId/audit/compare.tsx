import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "@/client/features/audit/compare/CompareView";

export const Route = createFileRoute("/_app/p/$projectId/audit/compare")({
  component: AuditComparePage,
});

function AuditComparePage() {
  const { projectId } = Route.useParams();
  return <CompareView projectId={projectId} />;
}
