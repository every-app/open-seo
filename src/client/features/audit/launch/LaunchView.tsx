import { AuditHistorySection } from "@/client/features/audit/launch/AuditHistorySection";
import { LaunchFormCard } from "@/client/features/audit/launch/LaunchFormCard";
import { SettingsModal } from "@/client/features/audit/launch/SettingsModal";
import { useLaunchController } from "@/client/features/audit/launch/useLaunchController";

export function LaunchView({
  projectId,
  onAuditStarted,
}: {
  projectId: string;
  onAuditStarted: (auditId: string) => void;
}) {
  const controller = useLaunchController({ projectId, onAuditStarted });

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold">Site Audit</h1>

        <LaunchFormCard
          launchForm={controller.launchForm}
          settingsForm={controller.settingsForm}
          state={controller.state}
          setState={controller.setState}
          isPending={controller.startMutation.isPending}
          onSubmit={controller.handleSubmit}
          onOpenSettings={controller.openSettings}
          onRunPsiToggle={controller.onRunPsiToggle}
          commitMaxPagesInput={controller.commitMaxPagesInput}
        />

        {controller.state.isSettingsOpen && (
          <SettingsModal
            settingsForm={controller.settingsForm}
            state={controller.state}
            setState={controller.setState}
            onClear={controller.clearPsiKey}
            onSave={controller.saveSettings}
          />
        )}

        <AuditHistorySection
          history={controller.historyQuery.data ?? []}
          isLoading={controller.historyQuery.isLoading}
          onView={onAuditStarted}
          onDelete={controller.deleteAudit}
        />
      </div>
    </div>
  );
}
