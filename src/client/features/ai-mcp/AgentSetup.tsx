import { ArrowLeft, ArrowRight } from "lucide-react";
import { AgentList } from "./AgentList";
import { AgentSetupPanel, AGENT_SETUP_DESCRIPTION } from "./AgentSetupPanel";
import { getAgentSetupPrompt } from "./agentSetupPrompt";
import { captureClientEvent } from "@/client/lib/posthog";

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
  const prompt = getAgentSetupPrompt(
    typeof window === "undefined"
      ? "https://app.openseo.so"
      : window.location.origin,
  );

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
        onCopy={() => captureClientEvent("onboarding:setup_prompt_copy")}
      />
      <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
        <Button
          variant="ghost"
          className="rounded-md flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" /> Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="gap-2"
          onClick={() => onComplete()}
        >
          Skip for now <ArrowRight className="size-4" />
        </Button>
      </div>
    </fieldset>
  );
}
