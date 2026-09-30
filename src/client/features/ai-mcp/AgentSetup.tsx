import { ArrowRight } from "lucide-react";
import { AgentList } from "./AgentList";
import { AgentSetupPanel, AGENT_SETUP_DESCRIPTION } from "./AgentSetupPanel";
import { getAgentSetupPrompt } from "./agentSetupPrompt";
import { captureClientEvent } from "@/client/lib/posthog";
import { WizardFooter } from "@/client/features/onboarding/WizardFooter";
import { Button } from "@/client/components/ui/button";

export function AgentSetup({
  onComplete,
  onBack,
  disabled = false,
}: {
  onComplete: () => void;
  onBack: () => void;
  disabled?: boolean;
}) {
  const prompt = getAgentSetupPrompt(window.location.origin);

  return (
    <fieldset disabled={disabled}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your agent
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {AGENT_SETUP_DESCRIPTION}
        </p>
        <AgentList />
      </div>
      <AgentSetupPanel
        prompt={prompt}
        mcpUrl={`${window.location.origin}/mcp`}
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
              onClick={onComplete}
            >
              Finish <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </fieldset>
  );
}
