import { NavTab, NavTabs } from "@/client/components/NavTabs";
import { useLocale } from "@/client/lib/i18n";

export function SettingsTabs({ projectId }: { projectId: string }) {
  const { t } = useLocale();

  const tabs = [
    {
      to: "/p/$projectId/settings" as const,
      label: t("project_settings.tabs.general"),
      exact: true,
    },
    {
      to: "/p/$projectId/settings/integrations" as const,
      label: t("project_settings.tabs.integrations"),
    },
  ];

  return (
    <NavTabs label={t("project_settings.sections")}>
      {tabs.map((tab) => (
        <NavTab
          key={tab.to}
          to={tab.to}
          params={{ projectId }}
          activeOptions={{ exact: tab.exact ?? false }}
        >
          {tab.label}
        </NavTab>
      ))}
    </NavTabs>
  );
}
