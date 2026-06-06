import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { seoGraphSearchSchema } from "@/types/schemas/seoGraph";
import { LaunchView, AuditDetail } from "@/client/features/seo-graph/SeoGraphLauncher";

export const Route = createFileRoute<"/_project/p/$projectId/seo-audit/">(
  "/_project/p/$projectId/seo-audit/",
)({
  validateSearch: seoGraphSearchSchema,
  component: SeoAuditPage,
});

function SeoAuditPage() {
  const { projectId } = Route.useParams();
  const { auditId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setAuditId = useCallback(
    (id: string | undefined) => {
      void navigate({
        search: (prev) => ({ ...prev, auditId: id }),
        replace: true,
      });
    },
    [navigate],
  );

  if (!auditId) {
    return (
      <LaunchView
        projectId={projectId}
        onAuditStarted={(id) => setAuditId(id)}
      />
    );
  }

  return (
    <AuditDetail
      projectId={projectId}
      auditId={auditId}
      onBack={() => setAuditId(undefined)}
    />
  );
}
