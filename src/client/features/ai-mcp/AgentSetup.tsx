import { ArrowLeft, ArrowRight } from "lucide-react";
import { AgentList } from "./AgentList";
import { AgentSetupPanel, AGENT_SETUP_DESCRIPTION } from "./AgentSetupPanel";
import { getAgentSetupPrompt } from "./agentSetupPrompt";
import { captureClientEvent } from "@/client/lib/posthog";
import { brand } from "@/shared/brand";

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
    typeof window === "undefined" ? brand.appUrl : window.location.origin,
  );

  return (
    <fieldset disabled={disabled}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your agent
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-base-content/60">
          {AGENT_SETUP_DESCRIPTION}
        </p>
        <AgentList />
      </div>
      <AgentSetupPanel
        prompt={prompt}
        onCopy={() => captureClientEvent("onboarding:setup_prompt_copy")}
      />
      <div className="mt-7 flex items-center justify-between gap-3 border-t border-base-300 pt-5">
        <button
          type="button"
          className="flex min-h-10 items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => onComplete()}
        >
          Skip for now <ArrowRight className="size-4" />
        </button>
      </div>
    </fieldset>
  );
}
