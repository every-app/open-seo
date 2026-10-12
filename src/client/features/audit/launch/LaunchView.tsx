import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { AuditHistorySection } from "@/client/features/audit/launch/AuditHistorySection";
import { LaunchFormCard } from "@/client/features/audit/launch/LaunchFormCard";
import { useLaunchController } from "@/client/features/audit/launch/useLaunchController";
import { useHostedPlanGate } from "@/client/features/billing/HostedPlanGate";

type LaunchViewProps = {
  projectId: string;
  initialUrl: string;
  onAuditStarted: (auditId: string) => void;
};

export function LaunchView({
  projectId,
  initialUrl,
  onAuditStarted,
}: LaunchViewProps) {
  // The plan only sets the page limit, so the form stays usable while the
  // plan loads. The server enforces the limit regardless.
  const isFreePlan = useHostedPlanGate() === "free";
  const controller = useLaunchController({
    projectId,
    initialUrl,
    isFreePlan,
    onAuditStarted,
  });

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader title="Site Audit" />

        <LaunchFormCard
          launchForm={controller.launchForm}
          commitMaxPagesInput={controller.commitMaxPagesInput}
          maxPagesLimit={controller.maxPagesLimit}
          paidMaxPagesLimit={controller.paidMaxPagesLimit}
          canRenderJavaScript={controller.canRenderJavaScript}
        />

        <AuditHistorySection
          projectId={projectId}
          historyQuery={controller.historyQuery}
          onDelete={controller.deleteAudit}
        />

        {controller.largeCrawlPages != null ? (
          <ConfirmDialog
            title="Start a large audit?"
            confirmLabel="Continue"
            onConfirm={controller.confirmLargeCrawl}
            onClose={controller.cancelLargeCrawl}
          >
            You are about to crawl {controller.largeCrawlPages.toLocaleString()}{" "}
            pages. This is okay, but it may take a while. Continue?
          </ConfirmDialog>
        ) : null}
      </div>
    </div>
  );
}
