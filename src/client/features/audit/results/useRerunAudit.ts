import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { startAudit } from "@/serverFunctions/audit";

/**
 * Starts the audit again with the same URL, page limit, exclusions and
 * Lighthouse setting, then opens the new audit.
 */
export function useRerunAudit({
  projectId,
  audit,
  renderJavaScript,
}: {
  projectId: string;
  audit: AuditResultsData["audit"];
  renderJavaScript: boolean;
}) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () =>
      startAudit({
        data: {
          projectId,
          startUrl: audit.startUrl,
          maxPages: audit.config.maxPages,
          lighthouseStrategy: audit.config.lighthouseStrategy,
          renderJavaScript,
          excludePaths: audit.config.excludePaths,
        },
      }),
    onSuccess: (result) => {
      void navigate({
        to: "/p/$projectId/audit",
        params: { projectId },
        search: { auditId: result.auditId, tab: "issues" },
      });
    },
  });
}
