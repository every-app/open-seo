import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LighthouseIssuesScreen } from "@/client/features/lighthouse/issues/LighthouseIssuesScreen";
import { lighthouseIssuesSearchSchema } from "@/types/schemas/lighthouse";

export const Route = createFileRoute(
  "/_project/p/$projectId/audit/issues/$resultId",
)({
  validateSearch: lighthouseIssuesSearchSchema,
  component: AuditIssuesPage,
});

function AuditIssuesPage() {
  const { projectId, resultId } = Route.useParams();
  const { auditId, category } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <LighthouseIssuesScreen
      projectId={projectId}
      resultId={resultId}
      category={category}
      backLabel="Site Audit"
      onBack={() =>
        void navigate({
          to: "/p/$projectId/audit",
          params: { projectId },
          search: auditId ? { auditId } : undefined,
        })
      }
      onCategoryChange={(next) =>
        void navigate({
          search: (prev) => ({ ...prev, category: next }),
          replace: true,
        })
      }
    />
  );
}
