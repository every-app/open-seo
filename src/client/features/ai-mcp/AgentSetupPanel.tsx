import { Package } from "lucide-react";
import { CopyButton } from "@/client/components/CopyButton";
import { useLocale } from "@/client/lib/i18n";

export const AGENT_SETUP_DESCRIPTION =
  "Paste this prompt into your agent to automatically configure OpenSEO for you.";

export function AgentSetupPanel({
  prompt,
  onCopy,
}: {
  prompt: string;
  onCopy?: () => void;
}) {
  const { t } = useLocale();

  return (
    <>
      <div className="rounded-xl border border-border bg-background/25 p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
            <Package className="size-5 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-medium">{t("ai.panel.plugin_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("ai.panel.plugin_subtitle")}
            </p>
          </div>
        </div>
        <CopyButton
          variant="default"
          size="lg"
          className="w-full"
          value={prompt}
          label={t("ai.panel.copy_button")}
          successMessage={t("ai.panel.copy_success")}
          onCopy={onCopy}
        />
      </div>
      <div className="mt-4 text-center">
        <a
          href="https://openseo.so/docs/agent-setup"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline decoration-muted-foreground/25 underline-offset-4 hover:text-foreground"
        >
          {t("ai.panel.manual_setup")}
        </a>
      </div>
    </>
  );
}
