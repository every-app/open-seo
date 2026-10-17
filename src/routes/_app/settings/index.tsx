import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ApiKeySettings } from "@/client/features/settings/ApiKeySettings";
import { SectionHeader } from "@/client/components/PageHeader";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";
import { LanguagePreferenceRadio } from "@/client/components/LanguagePreferenceMenuItems";
import { useLocale } from "@/client/lib/i18n";
import { Switch } from "@/client/components/ui/switch";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { version } from "../../../../package.json";

export const Route = createFileRoute("/_app/settings/")({
  component: PersonalSettings,
});

function PersonalSettings() {
  const isHosted = isHostedClientAuthMode();
  const { data: session } = useSession();
  const { t } = useLocale();
  const [isSaving, setIsSaving] = useState(false);

  const analyticsEnabled = session?.user?.analyticsOptedOut !== true;

  async function updateAnalyticsPreference(enabled: boolean) {
    setIsSaving(true);
    try {
      const result = await authClient.updateUser({
        analyticsOptedOut: !enabled,
      });
      if (result.error) {
        toast.error("We couldn't update your analytics setting.");
      } else {
        toast.success(
          enabled
            ? t("settings.analytics_enabled")
            : t("settings.analytics_disabled"),
        );
      }
    } catch {
      toast.error("We couldn't update your analytics setting.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionHeader title={t("settings.appearance")} />
        <div className="flex items-center justify-between gap-6">
          <span className="text-sm">{t("settings.theme")}</span>
          <ThemePreferenceRadio />
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-sm">{t("settings.language")}</span>
          <LanguagePreferenceRadio />
        </div>
      </section>

      {isHosted ? (
        <>
          <ApiKeySettings />

          <section className="space-y-3">
            <SectionHeader title={t("settings.analytics")} />
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm">{t("settings.analytics_help")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("settings.analytics_desc")}
                </p>
              </div>
              <Switch
                checked={analyticsEnabled}
                disabled={isSaving}
                onCheckedChange={(checked) => {
                  void updateAnalyticsPreference(checked);
                }}
                aria-label="Enable product analytics"
              />
            </div>
          </section>
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
