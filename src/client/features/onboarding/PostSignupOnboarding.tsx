import type { ReactNode } from "react";
import { OnboardingCard } from "./OnboardingCard";
import { ONBOARDING_STEPS } from "./onboardingModel";
import { WebsiteOnboardingStep } from "./WebsiteOnboardingStep";
import { AgentSetup } from "@/client/features/ai-mcp/AgentSetup";
import { SearchConsoleOnboardingStep } from "./SearchConsoleOnboardingStep";

type PostSignupOnboardingProps = {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onStepChange: (step: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  isSaving: boolean;
  accountMenu: ReactNode;
  /** Prefill for the website step, from the marketing site's free check. */
  suggestedDomain?: string;
};

export function PostSignupOnboarding({
  step,
  onNext,
  onBack,
  onStepChange,
  onSkip,
  onFinish,
  isSaving,
  accountMenu,
  suggestedDomain,
}: PostSignupOnboardingProps) {
  return (
    <>
      {accountMenu}
      <OnboardingCard
        step={step + 1}
        steps={["Website", "Google Search Console", "Agent setup"]}
        onStepChange={onStepChange}
        disabled={isSaving}
      >
        <fieldset disabled={isSaving} className="min-w-0">
          {ONBOARDING_STEPS[step] === "website" ? (
            <WebsiteOnboardingStep
              onNext={onNext}
              onSkip={onSkip}
              suggestedDomain={suggestedDomain}
            />
          ) : ONBOARDING_STEPS[step] === "search_console" ? (
            <SearchConsoleOnboardingStep
              onNext={onNext}
              onBack={onBack}
              onSkip={onSkip}
            />
          ) : (
            <AgentSetup onNext={onFinish} onBack={onBack} disabled={isSaving} />
          )}
        </fieldset>
      </OnboardingCard>
    </>
  );
}
