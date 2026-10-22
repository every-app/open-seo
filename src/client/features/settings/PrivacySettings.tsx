import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionHeader } from "@/client/components/PageHeader";
import {
  updatePrivacyChoices,
  usePrivacyChoices,
} from "@/client/components/PrivacyChoices";
import { Switch } from "@/client/components/ui/switch";
import { useLocale } from "@/client/lib/i18n";
import { useSession } from "@/lib/auth-client";
import { setProductUpdatesOptIn } from "@/serverFunctions/product-updates";

export function PrivacySettings() {
  const { t } = useLocale();
  const choices = usePrivacyChoices();
  const { data: session, refetch } = useSession();
  const productUpdates = useMutation({
    mutationFn: (optIn: boolean) => setProductUpdatesOptIn({ data: { optIn } }),
    // The session is served from a signed cookie cache, so bypass it to pick
    // up the saved choice.
    onSuccess: () => refetch({ query: { disableCookieCache: true } }),
    onError: () => toast.error(t("settings.privacy_updates_error")),
  });
  if (!choices || !session) return null;

  return (
    <section className="space-y-3">
      <SectionHeader title={t("settings.privacy_title")} />
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">{t("settings.privacy_analytics")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.privacy_analytics_desc")}
          </p>
        </div>
        <Switch
          checked={choices.analytics}
          onCheckedChange={(analytics) =>
            void updatePrivacyChoices({ ...choices, analytics }, true)
          }
          aria-label={t("settings.privacy_analytics_label")}
        />
      </div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">{t("settings.privacy_updates")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.privacy_updates_desc")}
          </p>
        </div>
        <Switch
          checked={
            productUpdates.isPending
              ? productUpdates.variables
              : session.user.productUpdatesOptIn === true
          }
          disabled={productUpdates.isPending}
          onCheckedChange={(optIn) => productUpdates.mutate(optIn)}
          aria-label={t("settings.privacy_updates_label")}
        />
      </div>
    </section>
  );
}
