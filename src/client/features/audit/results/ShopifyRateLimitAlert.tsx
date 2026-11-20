import { ShieldAlert } from "lucide-react";
import { Alert, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { useRerunAudit } from "@/client/features/audit/results/useRerunAudit";
import { useAuditCapabilities } from "@/client/features/audit/shared";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { renderingCostText } from "@/shared/audit-rendering";
import { AuditStatus } from "@/shared/audit-status";

/**
 * Shown when Shopify answered an audit's pages with 429. Waiting and a
 * crawler-access signature don't change the outcome, but loading the pages in
 * a browser does, so the button starts the audit again with Render JavaScript
 * on. An audit that already rendered can only be run again as it was.
 */
export function ShopifyRateLimitAlert({
  projectId,
  audit,
  rateLimitedCount,
}: {
  projectId: string;
  audit: AuditResultsData["audit"];
  rateLimitedCount: number;
}) {
  const capabilitiesQuery = useAuditCapabilities(projectId);
  const rendered = audit.config.renderJavaScript === true;
  const renderOnRerun =
    rendered || capabilitiesQuery.data?.canRenderJavaScript === true;
  const rerun = useRerunAudit({
    projectId,
    audit,
    renderJavaScript: renderOnRerun,
  });

  // Until this loads we can't tell whether the re-run will render.
  if (capabilitiesQuery.isPending) return null;

  return (
    <Alert variant="warning">
      <ShieldAlert />
      <AlertTitle>
        {audit.status === AuditStatus.Refused
          ? "Shopify refused our crawler, so this audit couldn't reach any pages."
          : `Shopify refused our crawler on ${rateLimitedCount} ${rateLimitedCount === 1 ? "page" : "pages"}.`}
      </AlertTitle>
      <div className="col-start-2 mt-2 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          pending={rerun.isPending}
          onClick={() => rerun.mutate()}
        >
          {rerun.isPending
            ? "Starting…"
            : renderOnRerun && !rendered
              ? "Re-run with Render JavaScript"
              : "Re-run audit"}
        </Button>
        {/* Only hosted plans pay for rendering, so only they see a price. */}
        {renderOnRerun && isHostedClientAuthMode() && (
          <span className="text-muted-foreground">
            {renderingCostText(audit.config.maxPages)}
          </span>
        )}
      </div>
    </Alert>
  );
}
