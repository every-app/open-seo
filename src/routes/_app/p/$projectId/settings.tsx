import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProjectPageHeader } from "@/client/features/projects/ProjectPageHeader";
import { SettingsTabs } from "@/client/features/projects/SettingsTabs";

import { useLocale } from "@/client/lib/i18n";

export const Route = createFileRoute("/_app/p/$projectId/settings")({
  component: ProjectSettingsLayout,
});

function ProjectSettingsLayout() {
  const { projectId } = Route.useParams();
  const { t } = useLocale();

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-4">
          <ProjectPageHeader
            projectId={projectId}
            title={t("project_settings.title")}
            showBackLink
          />
          <SettingsTabs projectId={projectId} />
        </div>

        <Outlet />
      </div>
    </div>
  );
}
