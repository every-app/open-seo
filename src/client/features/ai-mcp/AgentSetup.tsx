import { ArrowRight } from "lucide-react";
import { AgentList } from "./AgentList";
import { AgentSetupPanel } from "./AgentSetupPanel";
import { getAgentSetupPrompt } from "./agentSetupPrompt";
import { captureClientEvent } from "@/client/lib/posthog";
import { WizardFooter } from "@/client/features/onboarding/WizardFooter";
import { Button } from "@/client/components/ui/button";
import { useLocale } from "@/client/lib/i18n";

export function AgentSetup({
  onNext,
  onBack,
  disabled = false,
}: {
  onNext: () => void;
  onBack: () => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const prompt = getAgentSetupPrompt(window.location.origin);

  return (
    <fieldset disabled={disabled}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("ai.setup.title")}
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("ai.panel.description")}
        </p>
        <AgentList />
      </div>
      <AgentSetupPanel
        prompt={prompt}
        onCopy={() => captureClientEvent("onboarding:setup_prompt_copy")}
      />
      <div className="mt-7 border-t border-border pt-5">
        <WizardFooter
          className="mt-0"
          onBack={onBack}
          continueAction={
            <Button
              type="button"
              variant="ghost"
              className="h-8 gap-2 px-3 text-xs font-semibold"
              onClick={onNext}
            >
              {t("ai.onboarding.finish")} <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </fieldset>
  );
}
