import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiKeySettings } from "@/client/features/settings/ApiKeySettings";
import { SectionHeader } from "@/client/components/PageHeader";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";
import { LanguagePreferenceRadio } from "@/client/components/LanguagePreferenceMenuItems";
import { useLocale } from "@/client/lib/i18n";
import { everyAppAccountQueryOptions } from "@/client/features/every-app/everyAppAccountQueries";
import { McpConnectionsSettings } from "@/client/features/settings/McpConnectionsSettings";
import { PrivacySettings } from "@/client/features/settings/PrivacySettings";
import {
  isEveryAppClientAuthMode,
  isHostedClientAuthMode,
  usesBetterAuthClient,
} from "@/lib/auth-mode";
import { version } from "../../../../package.json";

export const Route = createFileRoute("/_app/settings/")({
  component: PersonalSettings,
});

function PersonalSettings() {
  const isHosted = isHostedClientAuthMode();
  const { t } = useLocale();

  // API keys need Better Auth accounts (hosted or the standalone Docker
  // edition); the analytics choices only exist on hosted.
  const hasAccounts = usesBetterAuthClient();
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

      {isEveryAppClientAuthMode() ? <EveryAppSettings /> : null}

      {isHosted ? <McpConnectionsSettings /> : null}

      {hasAccounts ? <ApiKeySettings /> : null}

      {isHosted ? (
        <PrivacySettings />
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

// Behind an Every App gateway, which owns the account, the team and the AI
// connections: say so, and link back.
function EveryAppSettings() {
  const { data: account } = useQuery(everyAppAccountQueryOptions());
  return (
    <section className="space-y-3">
      <SectionHeader title="Every App" />
      <p className="text-sm text-muted-foreground">
        Your account, teammates and AI connections are managed on Every App.
      </p>
      {account?.gatewayUrl ? (
        <a
          href={account.gatewayUrl}
          className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open Every App →
        </a>
      ) : null}
    </section>
  );
}
