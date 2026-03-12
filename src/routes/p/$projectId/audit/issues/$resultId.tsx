import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PsiIssuesScreen } from "@/client/features/psi/issues/PsiIssuesScreen";
import { psiIssuesSearchSchema } from "@/types/schemas/psi";

export const Route = createFileRoute("/p/$projectId/audit/issues/$resultId")({
  validateSearch: psiIssuesSearchSchema,
  component: AuditIssuesPage,
});

function AuditIssuesPage() {
  const { projectId, resultId } = Route.useParams();
  const { source, category } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <PsiIssuesScreen
      projectId={projectId}
      resultId={resultId}
      source={source}
      category={category}
      backLabel="Site Audit"
      onBack={() =>
        void navigate({
          to: "/p/$projectId/audit",
          params: { projectId },
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
