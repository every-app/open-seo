import { createFileRoute } from "@tanstack/react-router";
import { ApiKeySettings } from "@/client/features/settings/ApiKeySettings";
import { SectionHeader } from "@/client/components/PageHeader";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";
import { LanguagePreferenceRadio } from "@/client/components/LanguagePreferenceMenuItems";
import { useLocale } from "@/client/lib/i18n";
import { PrivacySettings } from "@/client/features/settings/PrivacySettings";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { version } from "../../../../package.json";

export const Route = createFileRoute("/_app/settings/")({
  component: PersonalSettings,
});

function PersonalSettings() {
  const isHosted = isHostedClientAuthMode();
  const { t } = useLocale();

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionHeader title={t("settings.appearance")} />
        <div className="flex items-center justify-between gap-6">
          <span className="text-sm">{t("settings.theme")}</span>
          <ThemePreferenceRadio />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <span className="text-sm">{t("settings.language")}</span>
            <p className="text-xs text-muted-foreground">
              {t("settings.language_desc")}
            </p>
          </div>
          <LanguagePreferenceRadio showLabels />
        </div>
      </section>

      {isHosted ? (
        <>
          <ApiKeySettings />

          <PrivacySettings />
        </>
      ) : (
        <section className="space-y-3">
          <SectionHeader title={t("settings.about")} />
          <div className="flex items-center justify-between gap-6">
            <span className="text-sm">{t("settings.version")}</span>
            <span className="font-mono text-sm text-muted-foreground">
              v{version}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
