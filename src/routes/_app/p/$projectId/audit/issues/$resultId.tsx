import { createFileRoute } from "@tanstack/react-router";
import { LighthouseIssuesScreen } from "@/client/features/lighthouse/issues/LighthouseIssuesScreen";
import { lighthouseIssuesSearchSchema } from "@/types/schemas/lighthouse";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute(
  "/_app/p/$projectId/audit/issues/$resultId",
)({
  head: () => pageHead("Site Audit"),
  validateSearch: lighthouseIssuesSearchSchema,
  component: AuditIssuesPage,
});

function AuditIssuesPage() {
  const { projectId, resultId } = Route.useParams();
  const { auditId, category } = Route.useSearch();

  return (
    <LighthouseIssuesScreen
      projectId={projectId}
      resultId={resultId}
      category={category}
      auditId={auditId}
    />
  );
}
